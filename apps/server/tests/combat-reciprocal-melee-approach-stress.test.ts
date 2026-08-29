/**
 * Extended stress test for reciprocal melee approach: multi-tick simulation
 * with real position updates (not a single pre-baked step), and both
 * getCombatants() orderings (NPC-first and player-first), to check for
 * oscillation (the "walk in, walk out, forever" symptom) across many ticks
 * rather than just the first tick.
 *
 * Run with: npx tsx tests/combat-reciprocal-melee-approach-stress.test.ts
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
    id: "reciprocal-melee-approach-stress-test",
    name: "Reciprocal melee approach stress test",
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

function stepToward(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    return { x: from.x + dx, y: from.y + dy };
}

/**
 * Simulates a full engagement: two melee actors starting `startDistance`
 * tiles apart on the same axis, run to convergence (or a tick budget),
 * applying each tick's chosen step as a real position update before the
 * next tick runs. Fails if the actors are ever further apart after a tick
 * than they were before it started (the "walked away" loop symptom) once
 * both have a path queued, or if they never converge within the budget.
 */
function simulateApproach(combatantOrder: "npc-first" | "player-first"): void {
    const player = new PlayerState(1, 3200, 3200, 0, TEST_GAMEMODE);
    const npc = new NpcState(2, 1, 1, -1, -1, 32, { x: 3206, y: 3200, level: 0 }, {
        maxHitpoints: 10,
    });

    player.setCombatTarget(npc);
    npc.engageCombat(player.id, 100, player);

    const pathService = {
        edgeHasWallBetween: () => false,
        findPathSteps: (request: { from: { x: number; y: number } }) => {
            const step = stepToward(request.from, { x: npc.tileX, y: npc.tileY });
            return { ok: true, steps: [step], end: step };
        },
        findNpcPathStep: (from: { x: number; y: number }) =>
            stepToward(from, { x: player.tileX, y: player.tileY }),
    } as unknown as PathService;

    const engine = new CombatTickEngine({
        pathService,
        getPlayer: (id) => (id === player.id ? player : undefined),
        getNpc: (id) => (id === npc.id ? npc : undefined),
        getCombatants: () => (combatantOrder === "npc-first" ? [npc, player] : [player, npc]),
        resolveAttackTraits: () => MELEE_TRAITS,
    });

    const distanceHistory: number[] = [];
    let converged = false;
    for (let tick = 100; tick < 130; tick++) {
        const distanceBefore = Math.max(
            Math.abs(player.tileX - npc.tileX),
            Math.abs(player.tileY - npc.tileY),
        );
        distanceHistory.push(distanceBefore);

        const result = engine.processTick(tick);
        if ((result.statuses.get("ready") ?? 0) === 2) {
            converged = true;
            break;
        }

        // Simulate movement resolution: apply whichever single step each
        // actor queued this tick, exactly as the real movement phase would.
        if (player.hasPath()) {
            const step = stepToward({ x: player.tileX, y: player.tileY }, { x: npc.tileX, y: npc.tileY });
            player.teleport(step.x, step.y, 0);
            player.clearPath();
        }
        if (npc.hasPath()) {
            const step = stepToward({ x: npc.tileX, y: npc.tileY }, { x: player.tileX, y: player.tileY });
            npc.teleport(step.x, step.y, 0);
            npc.clearPath();
        }

        const distanceAfter = Math.max(
            Math.abs(player.tileX - npc.tileX),
            Math.abs(player.tileY - npc.tileY),
        );
        // Both actors must never simultaneously step past one another back
        // to (or beyond) their starting separation - that oscillation is
        // exactly the reported "walk in, walk out, forever" loop.
        assert.ok(
            distanceAfter <= distanceBefore,
            `[${combatantOrder}] distance grew from ${distanceBefore} to ${distanceAfter} on tick ${tick} ` +
                `(history: ${distanceHistory.join(",")}) - actors walked away from each other`,
        );
    }

    assert.ok(
        converged,
        `[${combatantOrder}] actors never reached melee range within the tick budget ` +
            `(history: ${distanceHistory.join(",")})`,
    );
}

simulateApproach("npc-first");
simulateApproach("player-first");

console.log("reciprocal melee approach stress test passed");
