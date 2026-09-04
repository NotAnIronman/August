/**
 * Reciprocal melee approach test using the REAL pathfinder (not a mocked
 * pathService), to check whether NpcCombatInteractionHandler/
 * CombatInteractionProcessor's routing produces oscillation once actual
 * collision-aware pathfinding and the "dumb" NPC step algorithm
 * (PathService.findNpcPathStep) are involved, rather than a simplified
 * mock that always greedily reduces distance.
 *
 * Run with: pnpm exec tsx tests/combat-reciprocal-melee-real-pathfinding.test.ts
 */
import assert from "node:assert/strict";

import { CollisionMap } from "@august/osrs-engine/scene/CollisionMap";
import { AttackType } from "@server/game/combat/AttackType";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { CombatTickEngine } from "@server/game/combat/engine/CombatTickEngine";
import type { CombatAttackTraits } from "@server/game/combat/model/CombatAttack";
import type { GamemodeDefinition } from "@server/game/gamemodes/GamemodeDefinition";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import { PathService } from "@server/pathfinding/PathService";
import { CollisionFlag } from "@server/pathfinding/engine/flag/CollisionFlag";
import type { MapCollisionService, ServerMapSquare } from "@server/world/MapCollisionService";

const TEST_GAMEMODE = {
    id: "reciprocal-melee-real-pathfinding-test",
    name: "Reciprocal melee real pathfinding test",
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

// A single fully-open (no collision flags) 64x64 map square covering
// world tiles 3200..3263, matching the pattern already used in
// temporary-location.test.ts.
function makeOpenPathService(
    setupCollision?: (maps: CollisionMap[]) => void,
): PathService {
    const collisionMaps = Array.from({ length: 4 }, () => new CollisionMap(64, 64));
    setupCollision?.(collisionMaps);
    const mapSquare = {
        mapX: 50,
        mapY: 50,
        borderSize: 0,
        baseX: 3200,
        baseY: 3200,
        size: 64,
        collisionMaps,
    } as ServerMapSquare;
    const mapService = {
        getMapSquare: (mapX: number, mapY: number) =>
            mapX === 50 && mapY === 50 ? mapSquare : undefined,
        getCollisionPlaneAt: () => 0,
    } as unknown as MapCollisionService;
    return new PathService(mapService, 16);
}

/**
 * Runs a full engagement to convergence using the real pathfinder, applying
 * each tick's queued step as a real position update before the next tick.
 * Distance between the two actors must never increase once both are
 * actively pathing, and they must converge within the tick budget.
 */
function simulateApproach(
    label: string,
    npcStart: { x: number; y: number },
    npcSize: number,
    combatantOrder: "npc-first" | "player-first",
    setupCollision?: (maps: CollisionMap[]) => void,
): void {
    const pathService = makeOpenPathService(setupCollision);
    const player = new PlayerState(1, 3230, 3230, 0, TEST_GAMEMODE);
    const npc = new NpcState(2, 1, npcSize, -1, -1, 32, { ...npcStart, level: 0 }, {
        maxHitpoints: 10,
    });

    player.setCombatTarget(npc);
    npc.engageCombat(player.id, 100, player);

    const engine = new CombatTickEngine({
        pathService,
        getPlayer: (id) => (id === player.id ? player : undefined),
        getNpc: (id) => (id === npc.id ? npc : undefined),
        getCombatants: () => (combatantOrder === "npc-first" ? [npc, player] : [player, npc]),
        resolveAttackTraits: () => MELEE_TRAITS,
    });

    const distanceHistory: number[] = [];
    let converged = false;
    for (let tick = 100; tick < 160; tick++) {
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

        // Apply whichever single step each actor's real path queued this
        // tick, exactly as the movement phase would in production.
        if (player.hasPath()) {
            const next = player.peekNextStep();
            if (next) player.teleport(next.x, next.y, 0);
            player.clearPath();
        }
        if (npc.hasPath()) {
            const next = npc.peekNextStep();
            if (next) npc.teleport(next.x, next.y, 0);
            npc.clearPath();
        }

        const distanceAfter = Math.max(
            Math.abs(player.tileX - npc.tileX),
            Math.abs(player.tileY - npc.tileY),
        );
        assert.ok(
            distanceAfter <= distanceBefore,
            `[${label}/${combatantOrder}] distance grew from ${distanceBefore} to ${distanceAfter} ` +
                `on tick ${tick} (history: ${distanceHistory.join(",")}) - real-pathfinding loop reproduced`,
        );
    }

    assert.ok(
        converged,
        `[${label}/${combatantOrder}] never converged within budget (history: ${distanceHistory.join(",")})`,
    );
}

// Perfectly diagonal approach (the case my earlier greedy-mock test used).
simulateApproach("diagonal", { x: 3236, y: 3236 }, 1, "npc-first");
simulateApproach("diagonal", { x: 3236, y: 3236 }, 1, "player-first");

// Asymmetric offsets designed to stress nearestCardinalApproachTile's tie
// break: these put the NPC near a diagonal boundary relative to the player
// where two candidate approach tiles are equidistant, the exact geometry
// where a per-tick recompute could flip which side it commits to.
simulateApproach("near-diagonal-tie-a", { x: 3234, y: 3237 }, 1, "npc-first");
simulateApproach("near-diagonal-tie-a", { x: 3234, y: 3237 }, 1, "player-first");
simulateApproach("near-diagonal-tie-b", { x: 3237, y: 3233 }, 1, "npc-first");
simulateApproach("near-diagonal-tie-b", { x: 3237, y: 3233 }, 1, "player-first");

// Large (multi-tile) NPCs widen the candidate approach-tile set, which
// should make any tie-break instability more likely if it exists.
simulateApproach("3x3-diagonal", { x: 3236, y: 3236 }, 3, "npc-first");
simulateApproach("3x3-diagonal", { x: 3236, y: 3236 }, 3, "player-first");
simulateApproach("4x4-near-tie", { x: 3234, y: 3237 }, 4, "npc-first");
simulateApproach("4x4-near-tie", { x: 3234, y: 3237 }, 4, "player-first");

// Obstacle scenarios: a single-tile pillar directly between the player's
// starting position and the NPC's geometrically-nearest approach side.
// nearestCardinalApproachTile() picks a side using pure Chebyshev distance
// with no collision awareness, while the player's route uses the real
// pathfinder - this is where the two systems could disagree about which
// side is actually reachable, which is far more common in cluttered
// instance/boss rooms than the open overworld.
function withPillarBetween(maps: CollisionMap[]): void {
    // Player starts at (3230,3230); NPC at (3236,3236). Block the direct
    // diagonal corridor with a short wall so a genuine detour is required.
    for (const local of [
        { x: 3233 - 3200, y: 3233 - 3200 },
        { x: 3233 - 3200, y: 3234 - 3200 },
        { x: 3234 - 3200, y: 3233 - 3200 },
    ]) {
        maps[0].setFlag(local.x, local.y, CollisionFlag.OBJECT);
    }
}
simulateApproach("pillar-obstacle", { x: 3236, y: 3236 }, 1, "npc-first", withPillarBetween);
simulateApproach("pillar-obstacle", { x: 3236, y: 3236 }, 1, "player-first", withPillarBetween);
simulateApproach("pillar-obstacle-3x3", { x: 3236, y: 3236 }, 3, "npc-first", withPillarBetween);
simulateApproach("pillar-obstacle-3x3", { x: 3236, y: 3236 }, 3, "player-first", withPillarBetween);

console.log("reciprocal melee approach (real pathfinding) tests passed");
