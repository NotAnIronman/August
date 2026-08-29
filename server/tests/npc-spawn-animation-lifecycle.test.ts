import assert from "node:assert/strict";

import type { BasTypeLoader } from "../../client/rs/config/bastype/BasTypeLoader";
import type { NpcType } from "../../client/rs/config/npctype/NpcType";
import type { NpcTypeLoader } from "../../client/rs/config/npctype/NpcTypeLoader";
import { AttackType } from "../src/game/combat/AttackType";
import { createAggressionState } from "../src/game/combat/NpcAggression";
import { registerSkillConfiguration } from "../src/game/combat/SkillConfigurationProvider";
import { CombatTickEngine } from "../src/game/combat/engine/CombatTickEngine";
import type { CombatAttackTraits } from "../src/game/combat/model/CombatAttack";
import type { GamemodeDefinition } from "../src/game/gamemodes/GamemodeDefinition";
import { NPC_SPAWN_ANIMATION_FALLBACK_TICKS } from "../src/game/npc";
import { NpcManager } from "../src/game/npcManager";
import { PlayerState } from "../src/game/player";
import type { ServerServices } from "../src/game/ServerServices";
import { CombatEffectService } from "../src/game/services/CombatEffectService";
import type { PathService } from "../src/pathfinding/PathService";
import type { MapCollisionService } from "../src/world/MapCollisionService";

const SPAWN_SEQUENCE = 1234;
const SPAWN_DURATION_TICKS = 2;

const TEST_GAMEMODE = {
    id: "npc-spawn-animation-lifecycle-test",
    name: "NPC spawn animation lifecycle test",
    initializePlayer: () => undefined,
    canInteract: () => true,
} as unknown as GamemodeDefinition;

registerSkillConfiguration({
    computeCombatLevel: () => 3,
    skillRestoreIntervalTicks: 100,
    skillBoostDecayIntervalTicks: 100,
    hitpointRegenIntervalTicks: 100,
    hitpointOverhealDecayIntervalTicks: 100,
    preserveDecayMultiplier: 1.5,
});

const pathService = {
    edgeHasWallBetween: () => false,
    findPathSteps: () => ({ ok: false, steps: [] }),
    getCollisionFlagAt: () => 0,
} as unknown as PathService;

const npcType = {
    id: 32010,
    name: "Aggressive spawn test NPC",
    size: 1,
    rotationSpeed: 32,
    spawnDirection: 0,
    hitpoints: 20,
    combatLevel: 100,
    attackSpeed: 4,
    attackLevel: 100,
    strengthLevel: 100,
    defenceLevel: 100,
    magicLevel: 1,
    rangedLevel: 1,
    actions: ["Attack"],
    params: new Map(),
    getIdleSeqId: () => -1,
    getWalkSeqId: () => -1,
} as unknown as NpcType;

const manager = new NpcManager(
    {} as MapCollisionService,
    pathService,
    { load: () => npcType } as unknown as NpcTypeLoader,
    {} as BasTypeLoader,
);
const lifecycleEvents: string[] = [];
manager.setLifecycleHooks({
    onReset: (npcId, context) => {
        const npc = manager.getById(npcId);
        assert.ok(npc);
        npc.beginSpawnAnimation(
            SPAWN_SEQUENCE,
            context.currentTick,
            SPAWN_DURATION_TICKS,
            context.kind === "spawn" ? 1 : 0,
        );
        lifecycleEvents.push(`reset:${context.kind}:${context.currentTick}`);
    },
});

const player = new PlayerState(91, 3200, 3200, 0, TEST_GAMEMODE);
const aggressionState = createAggressionState(0, player.tileX, player.tileY);
const getNearbyPlayers = () => [
    {
        id: player.id,
        x: player.tileX,
        y: player.tileY,
        level: player.level,
        combatLevel: 3,
        inCombat: false,
        aggressionState,
    },
];

const npc = manager.spawnTransientNpc({
    id: npcType.id,
    x: 3201,
    y: 3200,
    level: 0,
    wanderRadius: 0,
    aggressionRadius: 3,
    aggressionSearchDelayTicks: 1,
    isAggressive: true,
});
assert.ok(npc);

const meleeTraits: CombatAttackTraits = Object.freeze({
    type: AttackType.Melee,
    style: null,
    rangeTiles: 1,
    speedTicks: 4,
});
const attackTicks: number[] = [];
const combatEngine = new CombatTickEngine({
    pathService,
    getPlayer: (id) => (id === player.id ? player : undefined),
    getNpc: (id) => (id === npc.id && manager.getById(id) ? npc : undefined),
    getCombatants: () => (manager.getById(npc.id) ? [npc] : []),
    resolveAttackTraits: () => meleeTraits,
    onAttackPrepared: (attack) => attackTicks.push(attack.attackClock),
});
const activeNpcIds = new Set([npc.id]);

// A direct/scripted combat request cannot bypass the same interaction lock.
npc.engageCombat(player.id, 1, player);
assert.equal(npc.getCombatTargetPlayerId(), undefined);
assert.equal(npc.isCombatTargetable(1), false);

const initialSpawnTick = manager.tick(1, activeNpcIds, getNearbyPlayers);
const initialSpawnUpdates = manager.consumeUpdates();
assert.deepEqual(initialSpawnTick.aggressionEvents, []);
assert.equal(npc.tileX, 3201);
assert.equal(npc.tileY, 3200);
assert.equal(
    initialSpawnUpdates.find((update) => update.id === npc.id)?.seq,
    SPAWN_SEQUENCE,
    "the configured spawn sequence must be emitted on the NPC's first sync tick",
);
lifecycleEvents.push("sequence:spawn:1");
assert.equal(combatEngine.processTick(1).preparedAttacks.length, 0);

manager.tick(2, activeNpcIds, getNearbyPlayers);
manager.consumeUpdates();
assert.equal(combatEngine.processTick(2).preparedAttacks.length, 0);
assert.equal(npc.getCombatTargetPlayerId(), undefined);

const initialUnlockTick = manager.tick(3, activeNpcIds, getNearbyPlayers);
manager.consumeUpdates();
assert.equal(initialUnlockTick.aggressionEvents.length, 1);
assert.equal(npc.getCombatTargetPlayerId(), player.id);
assert.equal(combatEngine.processTick(3).preparedAttacks.length, 1);
assert.deepEqual(attackTicks, [3]);

// Respawning inside the NPC phase emits immediately but receives the same
// duration-bound aggression, movement, targetability, and attack protection.
assert.equal(manager.queueRespawn(npc.id, 10), true);
const respawnTick = manager.tick(10, activeNpcIds, getNearbyPlayers);
const respawnUpdates = manager.consumeUpdates();
assert.deepEqual(respawnTick.aggressionEvents, []);
assert.equal(npc.getCombatTargetPlayerId(), undefined);
assert.equal(npc.isCombatTargetable(10), false);
assert.equal(
    respawnUpdates.find((update) => update.id === npc.id)?.seq,
    SPAWN_SEQUENCE,
    "respawn must emit the spawn sequence before reacquiring an adjacent player",
);
lifecycleEvents.push("sequence:respawn:10");
assert.equal(combatEngine.processTick(10).preparedAttacks.length, 0);

manager.tick(11, activeNpcIds, getNearbyPlayers);
manager.consumeUpdates();
assert.equal(combatEngine.processTick(11).preparedAttacks.length, 0);
assert.equal(npc.getCombatTargetPlayerId(), undefined);

const respawnUnlockTick = manager.tick(12, activeNpcIds, getNearbyPlayers);
manager.consumeUpdates();
assert.equal(respawnUnlockTick.aggressionEvents.length, 1);
assert.equal(combatEngine.processTick(12).preparedAttacks.length, 1);
assert.deepEqual(attackTicks, [3, 12]);
assert.deepEqual(lifecycleEvents, [
    "reset:spawn:0",
    "sequence:spawn:1",
    "reset:respawn:10",
    "sequence:respawn:10",
]);

// Cache metadata is authoritative when present; missing metadata leaves the
// caller free to apply the explicit conservative fallback.
const sequenceDurationService = new CombatEffectService({
    dataLoaderService: {
        getSeqTypeLoader: () => ({
            load: (sequenceId: number) =>
                sequenceId === SPAWN_SEQUENCE
                    ? {
                          isSkeletalSeq: () => false,
                          frameLengths: [30, 30],
                      }
                    : undefined,
        }),
    },
    equipmentService: { computeEquipmentStatBonuses: () => [] },
} as unknown as ServerServices);
assert.equal(
    sequenceDurationService.estimateNpcSequenceDurationTicks(SPAWN_SEQUENCE),
    SPAWN_DURATION_TICKS,
);
assert.equal(sequenceDurationService.estimateNpcSequenceDurationTicks(9999), undefined);
assert.equal(NPC_SPAWN_ANIMATION_FALLBACK_TICKS, 4);

console.log("npc-spawn-animation-lifecycle.test.ts passed");
