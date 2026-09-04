/**
 * Regression coverage for mutually engaged melee actors approaching one another.
 *
 * Run with: pnpm exec tsx tests/combat-reciprocal-melee-approach.test.ts
 */
import assert from "node:assert/strict";

import { AttackType } from "@server/game/combat/AttackType";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { CombatTickEngine } from "@server/game/combat/engine/CombatTickEngine";
import type { CombatAttackTraits } from "@server/game/combat/model/CombatAttack";
import type { GamemodeDefinition } from "@server/game/gamemodes/GamemodeDefinition";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import type { PathService } from "@server/pathfinding/PathService";

const TEST_GAMEMODE = {
    id: "reciprocal-melee-approach-test",
    name: "Reciprocal melee approach test",
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

const MELEE_TRAITS: CombatAttackTraits = Object.freeze({
    type: AttackType.Melee,
    style: null,
    rangeTiles: 1,
    speedTicks: 4,
});

const player = new PlayerState(1, 3200, 3200, 0, TEST_GAMEMODE);
const npc = new NpcState(
    2,
    1,
    1,
    -1,
    -1,
    32,
    { x: 3202, y: 3200, level: 0 },
    { maxHitpoints: 10 },
);

player.setCombatTarget(npc);
npc.engageCombat(player.id, 100, player);

let playerPathCalls = 0;
let npcPathCalls = 0;
let traitResolutionCalls = 0;
const pathService = {
    edgeHasWallBetween: () => false,
    findPathSteps: () => {
        playerPathCalls++;
        return { ok: true, steps: [{ x: 3201, y: 3200 }] };
    },
    findNpcPathStep: () => {
        npcPathCalls++;
        return { x: 3201, y: 3200 };
    },
} as unknown as PathService;

const engine = new CombatTickEngine({
    pathService,
    getPlayer: (id) => (id === player.id ? player : undefined),
    getNpc: (id) => (id === npc.id ? npc : undefined),
    // NPC-first is the more adversarial ordering: its route already exists by
    // the time the player decides whether to hold position.
    getCombatants: () => [npc, player],
    resolveAttackTraits: () => {
        traitResolutionCalls++;
        return MELEE_TRAITS;
    },
});

const approachTick = engine.processTick(100);
assert.equal(approachTick.statuses.get("moving"), 2);
assert.equal(player.hasPath(), false, "the player must hold while its melee target approaches");
assert.equal(npc.hasPath(), true, "the mutually engaged NPC must own the closing step");
assert.equal(playerPathCalls, 0, "the actors must not queue competing routes to one tile");
assert.equal(npcPathCalls, 1);
assert.equal(traitResolutionCalls, 2, "each combatant's attack choice resolves once per tick");

npc.teleport(3201, 3200, 0);
const adjacentTick = engine.processTick(101);
assert.equal(adjacentTick.statuses.get("ready"), 2);
assert.equal(adjacentTick.preparedAttacks.length, 2);
assert.equal(playerPathCalls, 0);
assert.equal(npcPathCalls, 1);
assert.equal(traitResolutionCalls, 4);

const fallbackPlayer = new PlayerState(3, 3300, 3300, 0, TEST_GAMEMODE);
const blockedNpc = new NpcState(
    4,
    1,
    1,
    -1,
    -1,
    32,
    { x: 3302, y: 3300, level: 0 },
    { maxHitpoints: 10 },
);
fallbackPlayer.setCombatTarget(blockedNpc);
blockedNpc.engageCombat(fallbackPlayer.id, 200, fallbackPlayer);
let fallbackPlayerPaths = 0;
const blockedNpcPathService = {
    edgeHasWallBetween: () => false,
    findPathSteps: (_request: unknown, options: { routeStrategy: unknown }) => {
        fallbackPlayerPaths++;
        const end = { x: 3301, y: 3300 };
        const strategy = options.routeStrategy as {
            hasArrived: (x: number, y: number, level: number, size: number) => boolean;
        };
        assert.equal(strategy.hasArrived(end.x, end.y, 0, 1), true);
        return { ok: true, steps: [end], end };
    },
    findNpcPathStep: () => undefined,
} as unknown as PathService;
const fallbackEngine = new CombatTickEngine({
    pathService: blockedNpcPathService,
    getPlayer: (id) => (id === fallbackPlayer.id ? fallbackPlayer : undefined),
    getNpc: (id) => (id === blockedNpc.id ? blockedNpc : undefined),
    getCombatants: () => [fallbackPlayer, blockedNpc],
    resolveAttackTraits: () => MELEE_TRAITS,
});
const fallbackTick = fallbackEngine.processTick(200);
assert.equal(fallbackTick.statuses.get("moving"), 1);
assert.equal(fallbackTick.statuses.get("unreachable"), 1);
assert.equal(fallbackPlayer.hasPath(), true, "player pathing must remain the fallback");
assert.equal(blockedNpc.hasPath(), false);
assert.equal(fallbackPlayerPaths, 1);

const overlapPlayer = new PlayerState(5, 3400, 3400, 0, TEST_GAMEMODE);
const overlapNpc = new NpcState(
    6,
    1,
    1,
    -1,
    -1,
    32,
    { x: 3400, y: 3400, level: 0 },
    { maxHitpoints: 10 },
);
overlapPlayer.setCombatTarget(overlapNpc);
overlapNpc.engageCombat(overlapPlayer.id, 300, overlapPlayer);
let overlapPlayerPaths = 0;
let overlapNpcPaths = 0;
const overlapEngine = new CombatTickEngine({
    pathService: {
        edgeHasWallBetween: () => false,
        findPathSteps: () => {
            overlapPlayerPaths++;
            return { ok: true, steps: [{ x: 3401, y: 3400 }] };
        },
        findNpcPathStep: () => {
            overlapNpcPaths++;
            return { x: 3399, y: 3400 };
        },
    } as unknown as PathService,
    getPlayer: (id) => (id === overlapPlayer.id ? overlapPlayer : undefined),
    getNpc: (id) => (id === overlapNpc.id ? overlapNpc : undefined),
    getCombatants: () => [overlapPlayer, overlapNpc],
    resolveAttackTraits: () => MELEE_TRAITS,
});
const overlapTick = overlapEngine.processTick(300);
assert.equal(overlapTick.statuses.get("moving"), 2);
assert.equal(overlapPlayer.hasPath(), false, "the player holds while an overlap is resolved");
assert.equal(overlapNpc.hasPath(), true, "the NPC alone owns the overlap escape step");
assert.equal(overlapPlayerPaths, 0, "overlapped actors must not queue competing paths");
assert.equal(overlapNpcPaths, 1);

console.log("reciprocal melee approach regression test passed");
