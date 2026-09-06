import type { PlayerState } from "@server/game/player";

/**
 * Slayer points and task streak, stored directly in the real OSRS varbits
 * — confirmed via RuneLite's public, actively-maintained Varbits.java
 * gameval source (references 2026-era content, so current, not a stale
 * pre-NXT numbering).
 *
 * There is deliberately no separate custom counter for these two values
 * anymore. player.varps (PlayerVarpState) already implements its own
 * full serialize/deserialize as a PersistentSubState — every varbit,
 * including these two, already survives login/logout and travels with
 * the account automatically, with zero extra persistence code needed
 * here. Keeping a parallel shadow copy in SlayerTaskTracker would just be
 * a second source of truth that could drift from the real value for no
 * benefit. (Active task assignment and one-time reward unlocks still
 * live in SlayerTaskTracker, since those have no real-OSRS varbit
 * equivalent to piggyback on.)
 */
export const SLAYER_POINTS_VARBIT = 4068;
export const SLAYER_TASK_STREAK_VARBIT = 4069;

export function getSlayerPoints(player: PlayerState): number {
    return player.varps.getVarbitValue(SLAYER_POINTS_VARBIT);
}

/** Adds (or, for a negative amount, removes) points. Clamped at 0. Returns the new balance. */
export function addSlayerPoints(player: PlayerState, amount: number): number {
    const next = Math.max(0, getSlayerPoints(player) + amount);
    player.varps.setVarbitValue(SLAYER_POINTS_VARBIT, next);
    return next;
}

/** Returns false (balance unchanged) if the player can't afford it. */
export function spendSlayerPoints(player: PlayerState, amount: number): boolean {
    const current = getSlayerPoints(player);
    if (current < amount) return false;
    player.varps.setVarbitValue(SLAYER_POINTS_VARBIT, current - amount);
    return true;
}

export function getSlayerStreak(player: PlayerState): number {
    return player.varps.getVarbitValue(SLAYER_TASK_STREAK_VARBIT);
}

export function incrementSlayerStreak(player: PlayerState): number {
    const next = getSlayerStreak(player) + 1;
    player.varps.setVarbitValue(SLAYER_TASK_STREAK_VARBIT, next);
    return next;
}

export function resetSlayerStreak(player: PlayerState): void {
    player.varps.setVarbitValue(SLAYER_TASK_STREAK_VARBIT, 0);
}
