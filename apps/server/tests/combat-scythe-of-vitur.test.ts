import assert from "node:assert/strict";

import { AttackType } from "@server/game/combat/AttackType";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { CombatHitProcessor } from "@server/game/combat/engine/CombatHitProcessor";
import {
    CombatAttackStyle,
    type CombatAttack,
} from "@server/game/combat/model/CombatAttack";
import {
    npcCombatEntityRef,
    playerCombatEntityRef,
} from "@server/game/combat/model/CombatEntityRef";
import { CombatPluginRegistry } from "@server/game/combat/plugins/CombatPluginRegistry";
import type { ServerServices } from "@server/game/ServerServices";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";

const TEST_GAMEMODE = createTestGamemode(
    "combat-scythe-of-vitur-test",
    "Combat scythe of vitur test",
);

registerSkillConfiguration({
    computeCombatLevel: () => 3,
    skillRestoreIntervalTicks: 100,
    skillBoostDecayIntervalTicks: 100,
    hitpointRegenIntervalTicks: 100,
    hitpointOverhealDecayIntervalTicks: 100,
    preserveDecayMultiplier: 1.5,
});

// Regular (charged) scythe of vitur.
const SCYTHE_OF_VITUR_ITEM_ID = 22325;

function createPlayer(id: number, x: number, y: number): PlayerState {
    const player = new PlayerState(id, x, y, 0, TEST_GAMEMODE);
    player.combat.weaponItemId = SCYTHE_OF_VITUR_ITEM_ID;
    player.combat.weaponCategory = 14;
    return player;
}

function createNpc(id: number, x: number, y: number, size = 1): NpcState {
    return new NpcState(id, 1, size, -1, -1, 32, { x, y, level: 0 }, {
        maxHitpoints: 5000,
        combatLevel: 32,
    });
}

// Normal (non-special) melee swing — this is the mechanic that was missing.
function createAttack(player: PlayerState, target: NpcState): CombatAttack {
    return Object.freeze({
        attacker: playerCombatEntityRef(player.id),
        target: npcCombatEntityRef(target.id),
        attackClock: 50,
        traits: Object.freeze({
            type: AttackType.Melee,
            style: CombatAttackStyle.Aggressive,
            rangeTiles: 1,
            speedTicks: 5,
            weaponId: SCYTHE_OF_VITUR_ITEM_ID,
            specialAttack: false,
        }),
    });
}

function processSwing(player: PlayerState, npcs: readonly NpcState[]) {
    const processor = new CombatHitProcessor({
        players: {
            getById: (id: number) => (id === player.id ? player : undefined),
            getAllPlayersForSync: () => [player],
        },
        npcManager: {
            getById: (id: number) => npcs.find((npc) => npc.id === id),
            forEach: (callback: (npc: NpcState) => void) => npcs.forEach(callback),
            hasNpcOption: () => true,
        },
        equipmentService: {
            computeEquipmentStatBonuses: () => new Array<number>(14).fill(0),
        },
        messagingService: { queueChatMessage: () => undefined },
        variableService: { queueVarp: () => undefined },
        queueCombatState: () => undefined,
        broadcastService: {
            enqueueSpotAnimation: () => undefined,
            queueBroadcastSound: () => undefined,
        },
    } as unknown as ServerServices);
    const result = processor.processPreparedAttacks([createAttack(player, npcs[0])], 50);
    return { processor, result };
}

// The category-14 profile resolves for every scythe variant via weapon category,
// not just the hardcoded item id.
const profile = CombatPluginRegistry.shared.resolve({
    weaponId: SCYTHE_OF_VITUR_ITEM_ID,
    categoryId: 14,
});
assert.equal(profile.id, "core:scythe_of_vitur");
const normalAttackPlan = profile.handleNormalAttack?.(
    undefined as never,
    undefined as never,
    undefined as never,
);
assert.ok(normalAttackPlan, "scythe must define a normal-attack plan");
assert.equal(normalAttackPlan?.targeting?.width, 3);
assert.equal(normalAttackPlan?.targeting?.requiresMultiCombat, false);
assert.equal(normalAttackPlan?.targeting?.largeTargetExtraHits?.[0]?.damageMultiplier, 0.5);
assert.equal(normalAttackPlan?.targeting?.largeTargetExtraHits?.[1]?.damageMultiplier, 0.25);

// Facing north: a 1x1 target only takes the single primary hit, no chaining.
const soloPlayer = createPlayer(1, 3200, 5700);
const soloTarget = createNpc(2, 3200, 5702);
const solo = processSwing(soloPlayer, [soloTarget]);
assert.equal(solo.result.queuedHits, 1, "a 1x1 target should receive exactly one hit");

// A 2x2 target (e.g. Vardorvis) takes the primary hit plus one 50% second hit.
const twoByTwoPlayer = createPlayer(10, 3210, 5700);
const twoByTwoTarget = createNpc(20, 3210, 5702, 2);
const twoByTwo = processSwing(twoByTwoPlayer, [twoByTwoTarget]);
assert.equal(
    twoByTwo.result.queuedHits,
    2,
    "a 2x2 target should receive the primary hit plus one extra hit",
);

// A 3x3+ target (e.g. a dragon) takes the primary hit plus both extra hits.
const threeByThreePlayer = createPlayer(30, 3220, 5700);
const threeByThreeTarget = createNpc(40, 3220, 5702, 3);
const threeByThree = processSwing(threeByThreePlayer, [threeByThreeTarget]);
assert.equal(
    threeByThree.result.queuedHits,
    3,
    "a 3x3+ target should receive the primary hit plus both extra hits",
);

// In front of ordinary 1x1s (not one large target), the arc can strike up to
// two additional separate targets, same as the dragon halberd sweep pattern.
const arcPlayer = createPlayer(50, 3230, 5700);
const arcPrimary = createNpc(60, 3230, 5702);
const arcLeft = createNpc(61, 3229, 5702);
const arcRight = createNpc(62, 3231, 5702);
const arc = processSwing(arcPlayer, [arcPrimary, arcLeft, arcRight]);
assert.equal(
    arc.result.queuedHits,
    3,
    "the 1x3 arc should be able to hit three separate 1x1 targets in front of the player",
);

// A non-scythe melee weapon (e.g. a plain dagger, category 17) must be
// completely unaffected by this profile.
const daggerProfile = CombatPluginRegistry.shared.resolve({ weaponId: 1205, categoryId: 17 });
assert.notEqual(daggerProfile.id, "core:scythe_of_vitur");
assert.equal(daggerProfile.handleNormalAttack, undefined);

console.log("scythe of vitur regression tests passed");
