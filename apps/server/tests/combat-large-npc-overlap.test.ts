/**
 * Regression coverage for footprint-aware under-target combat movement.
 *
 * Run with: pnpm exec tsx tests/combat-large-npc-overlap.test.ts
 */
import assert from "node:assert/strict";

import { AttackType } from "@server/game/combat/AttackType";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { CombatTickEngine } from "@server/game/combat/engine/CombatTickEngine";
import type { CombatAttackTraits } from "@server/game/combat/model/CombatAttack";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import type { PathService } from "@server/pathfinding/PathService";

const TEST_GAMEMODE = createTestGamemode("large-npc-overlap-test", "Large NPC overlap test");

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
const dragon = new NpcState(
    2,
    1,
    3,
    -1,
    -1,
    32,
    { x: 3200, y: 3200, level: 0 },
    { maxHitpoints: 10 },
);

player.setCombatTarget(dragon);
dragon.engageCombat(player.id, 100, { tileX: player.tileX, tileY: player.tileY });

let npcPathCalls = 0;
let playerPathCalls = 0;
const pathService = {
    edgeHasWallBetween: () => false,
    findPathSteps: (_request: unknown, options: { routeStrategy: unknown }) => {
        playerPathCalls++;
        const strategy = options.routeStrategy as {
            hasArrived: (x: number, y: number, level: number, size: number) => boolean;
        };
        const end = { x: 3199, y: 3200 };
        assert.equal(strategy.hasArrived(end.x, end.y, 0, 1), true);
        return { ok: true, steps: [end], end };
    },
    findNpcPathStep: () => {
        npcPathCalls++;
        return { x: 3199, y: 3200 };
    },
} as unknown as PathService;

const engine = new CombatTickEngine({
    pathService,
    getPlayer: (id) => (id === player.id ? player : undefined),
    getNpc: (id) => (id === dragon.id ? dragon : undefined),
    getCombatants: () => [player, dragon],
    resolveAttackTraits: () => MELEE_TRAITS,
});

const overlapTick = engine.processTick(100);
assert.equal(overlapTick.statuses.get("moving"), 2);
assert.equal(player.hasPath(), true, "the attacking player should route out of the NPC footprint");
assert.equal(
    dragon.hasPath(),
    false,
    "the large NPC must hold position while the embedded player takes the sole escape route",
);
assert.equal(playerPathCalls, 1, "large-footprint overlap must preserve the player's escape route");
assert.equal(npcPathCalls, 0, "overlap must not create two uncoordinated escape routes");

player.teleport(3199, 3200, 0);
const adjacentTick = engine.processTick(101);
assert.equal(adjacentTick.statuses.get("ready"), 2);
assert.equal(adjacentTick.preparedAttacks.length, 2);
assert.equal(playerPathCalls, 1);
assert.equal(npcPathCalls, 0);

console.log("large NPC overlap combat regression test passed");
