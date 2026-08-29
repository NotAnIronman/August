import type { Actor } from "../../actor";
import { NpcState } from "../../npc";
import { PlayerState } from "../../player";
import { logger } from "../../../utils/logger";

/**
 * Set MELEE_APPROACH_DEBUG=1 in the server environment to enable. Off by
 * default: zero overhead when disabled (checked once at module load, not
 * per call), and even when enabled, only logs actors that are actively
 * approaching a melee target (not every combat tick for every entity).
 *
 * Purpose: issue #2 ("melee walk loop") could not be reproduced against the
 * real pathfinder in isolated testing (see
 * server/tests/combat-reciprocal-melee-real-pathfinding.test.ts), which
 * strongly suggests the server's authoritative tile positions are not
 * actually oscillating - if that's confirmed live via this log, the bug is
 * very likely client-side rendering/interpolation rather than server pathing.
 *
 * To capture a repro: set MELEE_APPROACH_DEBUG=1, start the server, engage
 * a melee NPC, and grep the server log for "melee-approach" while the
 * visual loop is happening. Send that log back for analysis - specifically
 * whether `distanceTiles` ever goes UP tick-over-tick for the same pair
 * (that would confirm a genuine server-side bug) or stays monotonically
 * non-increasing (confirming the positions are fine and the bug is
 * client-side).
 */
export const MELEE_APPROACH_DEBUG_ENABLED = process.env.MELEE_APPROACH_DEBUG === "1";

interface MeleeApproachLogEntry {
    lastDistance: number;
    lastTick: number;
}

const lastLoggedByAttacker = new WeakMap<Actor, MeleeApproachLogEntry>();

function describeActor(actor: Actor): string {
    if (actor instanceof PlayerState) {
        return `player#${actor.id}(${actor.name ?? "?"})`;
    }
    if (actor instanceof NpcState) {
        return `npc#${actor.id}(type=${actor.typeId},size=${actor.size})`;
    }
    return "actor#?";
}

/**
 * Logs one approach decision. Call this right before/after routing is
 * decided in CombatInteractionProcessor.process(), for the not-yet-in-range
 * branch only (approach phase, which is what issue #2 reports).
 */
export function logMeleeApproachDecision(params: {
    tick: number;
    attacker: Actor;
    target: Actor;
    reciprocalBranch: "player-yields" | "npc-yields" | "none";
    routed: boolean;
}): void {
    if (!MELEE_APPROACH_DEBUG_ENABLED) return;

    const { tick, attacker, target, reciprocalBranch, routed } = params;
    const distanceTiles = Math.max(
        Math.abs(attacker.tileX - target.tileX),
        Math.abs(attacker.tileY - target.tileY),
    );

    const prior = lastLoggedByAttacker.get(attacker);
    const grew = prior !== undefined && distanceTiles > prior.lastDistance;
    lastLoggedByAttacker.set(attacker, { lastDistance: distanceTiles, lastTick: tick });

    logger.info(
        `[melee-approach] tick=${tick} ${describeActor(attacker)} -> ${describeActor(target)} ` +
            `attackerTile=(${attacker.tileX},${attacker.tileY}) targetTile=(${target.tileX},${target.tileY}) ` +
            `distanceTiles=${distanceTiles} reciprocalBranch=${reciprocalBranch} routed=${routed}` +
            (grew
                ? ` *** DISTANCE GREW from ${prior!.lastDistance} (last logged tick ${prior!.lastTick}) - SERVER-SIDE OSCILLATION ***`
                : ""),
    );
}

/** Clears tracked history for an actor (call on combat end/despawn to avoid stale WeakMap growth concerns in long sessions - WeakMap already GCs on actor collection, this is just for a clean immediate reset). */
export function resetMeleeApproachLog(actor: Actor): void {
    lastLoggedByAttacker.delete(actor);
}
