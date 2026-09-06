/**
 * Slayer skill — shared types.
 *
 * Design mirrors the Achievement Diary task tracker
 * (see diary-tasks/AchievementTaskTracker.ts): a plain in-memory tracker
 * keyed by playerId, serialized into VanillaGamemode's per-player save
 * blob rather than living on PlayerState itself. Monster grouping is
 * hand-authored (category key -> exact spawn names, resolved to live
 * npcTypeIds via npcIdsByNames()) rather than trusting the sparse/optional
 * `species` field in npc-combat-stats.json, which only covers a small
 * hand-picked subset of NPCs.
 */

/** A stable, hand-authored grouping of NPC variants that all count toward
 *  the same Slayer assignment (e.g. every black demon variant/location). */
export interface SlayerCategoryDefinition {
    key: string;
    /** Player-facing name, e.g. "black demons". */
    displayName: string;
    /** Exact spawn names (case-insensitive) resolved via npc-spawns.json. */
    monsterNames: readonly string[];
    /** Slayer level required to receive this as an assignment. */
    slayerLevelRequired: number;
    /** Slayer XP granted per confirmed kill while this is the active task. */
    xpPerKill: number;
    /** Optional short flavour text shown by "hint"/broadcast dialogue. */
    locationHint?: string;
    /** Known real-OSRS prerequisite (quest/equipment) not yet enforced by this implementation. */
    note?: string;
}

/** One weighted entry in a master's assignment table. */
export interface SlayerMasterTaskEntry {
    categoryKey: string;
    weight: number;
    minAmount: number;
    maxAmount: number;
}

export interface SlayerMasterDefinition {
    id: string;
    displayName: string;
    /** Live NPC type IDs with the Assignment/Trade/Rewards option set. */
    npcIds: readonly number[];
    combatLevelRequired: number;
    pointsPerTask: number;
    tasks: readonly SlayerMasterTaskEntry[];
}

/** One player's currently assigned task. */
export interface SlayerAssignedTask {
    masterId: string;
    categoryKey: string;
    assignedAmount: number;
    remainingAmount: number;
}

/** JSON-safe per-player Slayer state, persisted in VanillaGamemode's save data. */
export interface SlayerPersistentState {
    task?: SlayerAssignedTask;
    points?: number;
    /** Consecutive tasks completed without a task-skip, used for the streak bonus. */
    streak?: number;
    /** Total tasks completed, lifetime (for stats / future unlocks). */
    totalCompleted?: number;
    /** categoryKey -> owned-count, for reward-shop entries that are one-time unlocks. */
    unlocks?: string[];
}
