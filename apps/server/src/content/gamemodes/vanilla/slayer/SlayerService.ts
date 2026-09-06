import { SkillId } from "@august/osrs-engine/skill/skills";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import {
    getAllSlayerMasterNpcIds,
    getSlayerMaster,
    getSlayerMasterByNpcId,
} from "@server/content/gamemodes/vanilla/slayer/SlayerMasterDefinitions";
import {
    getCategoryKeysForNpc,
    getCategoryNpcIds,
    getSlayerCategory,
} from "@server/content/gamemodes/vanilla/slayer/SlayerMonsterCategories";
import { slayerTaskTracker } from "@server/content/gamemodes/vanilla/slayer/SlayerTaskTracker";
import { getPointsMultiplier, getTaskQuantityMultiplier } from "@server/content/gamemodes/vanilla/slayer/SlayerRewardShop";
import {
    addSlayerPoints,
    getSlayerStreak,
    incrementSlayerStreak,
    resetSlayerStreak,
} from "@server/content/gamemodes/vanilla/slayer/SlayerVarbitSync";
import type { SlayerAssignedTask, SlayerMasterTaskEntry } from "@server/content/gamemodes/vanilla/slayer/types";

/** Points awarded on top of the master's base reward every 10th consecutive task. */
const STREAK_BONUS_INTERVAL = 10;
const STREAK_BONUS_POINTS = 50;

export { getAllSlayerMasterNpcIds, getSlayerMasterByNpcId };

function pickWeightedTask(
    entries: readonly SlayerMasterTaskEntry[],
    slayerLevel: number,
    random: () => number = Math.random,
): SlayerMasterTaskEntry | undefined {
    const eligible = entries.filter((candidate) => {
        const category = getSlayerCategory(candidate.categoryKey);
        return category !== undefined && category.slayerLevelRequired <= slayerLevel;
    });
    const totalWeight = eligible.reduce((sum, candidate) => sum + candidate.weight, 0);
    if (eligible.length === 0 || totalWeight <= 0) return undefined;

    let cursor = Math.min(Math.max(random(), 0), 0.9999999999999999) * totalWeight;
    for (const candidate of eligible) {
        cursor -= candidate.weight;
        if (cursor < 0) return candidate;
    }
    return eligible[eligible.length - 1];
}

export type AssignTaskResult =
    | { kind: "assigned"; task: SlayerAssignedTask; description: string }
    | { kind: "already-has-task"; description: string }
    | { kind: "level-too-low"; requiredCombatLevel: number }
    | { kind: "no-eligible-tasks" };

/** Player's current combat level, derived the same way PlayerSkillSystem does (sum of relevant skills). */
function getPlayerCombatLevel(player: PlayerState, services: ScriptServices): number {
    const attack = services.skills.getSkill(player, SkillId.Attack).baseLevel;
    const strength = services.skills.getSkill(player, SkillId.Strength).baseLevel;
    const defence = services.skills.getSkill(player, SkillId.Defence).baseLevel;
    const hitpoints = services.skills.getSkill(player, SkillId.Hitpoints).baseLevel;
    const prayer = services.skills.getSkill(player, SkillId.Prayer).baseLevel;
    const ranged = services.skills.getSkill(player, SkillId.Ranged).baseLevel;
    const magic = services.skills.getSkill(player, SkillId.Magic).baseLevel;

    const base = 0.25 * (defence + hitpoints + Math.floor(prayer / 2));
    const melee = 0.325 * (attack + strength);
    const range = 0.325 * Math.floor((ranged * 3) / 2);
    const mage = 0.325 * Math.floor((magic * 3) / 2);
    return Math.floor(base + Math.max(melee, range, mage));
}

export function describeTask(task: SlayerAssignedTask): string {
    const category = getSlayerCategory(task.categoryKey);
    const name = category?.displayName ?? task.categoryKey;
    return `${task.remainingAmount} ${name} (of ${task.assignedAmount} assigned)`;
}

export function assignTask(
    player: PlayerState,
    masterId: string,
    services: ScriptServices,
    random: () => number = Math.random,
): AssignTaskResult {
    const master = getSlayerMaster(masterId);
    if (!master) return { kind: "no-eligible-tasks" };

    const existing = slayerTaskTracker.getTask(player.id);
    if (existing) {
        return { kind: "already-has-task", description: describeTask(existing) };
    }

    const combatLevel = getPlayerCombatLevel(player, services);
    if (combatLevel < master.combatLevelRequired) {
        return { kind: "level-too-low", requiredCombatLevel: master.combatLevelRequired };
    }

    const slayerLevel = services.skills.getSkill(player, SkillId.Slayer).baseLevel;
    const picked = pickWeightedTask(master.tasks, slayerLevel, random);
    if (!picked) return { kind: "no-eligible-tasks" };

    const span = Math.max(1, picked.maxAmount - picked.minAmount + 1);
    const baseAmount = picked.minAmount + Math.floor(Math.min(random(), 0.999999) * span);
    const amount = Math.max(1, Math.round(baseAmount * getTaskQuantityMultiplier(player.id)));

    const task: SlayerAssignedTask = {
        masterId: master.id,
        categoryKey: picked.categoryKey,
        assignedAmount: amount,
        remainingAmount: amount,
    };
    slayerTaskTracker.setTask(player.id, task);
    return { kind: "assigned", task, description: describeTask(task) };
}

export function cancelTask(player: PlayerState): void {
    slayerTaskTracker.setTask(player.id, undefined);
    resetSlayerStreak(player);
}

export type NpcKillOutcome =
    | { kind: "no-task" }
    | { kind: "not-a-match"; npcTypeId: number; npcName: string | undefined; expectedCategoryKey: string }
    | { kind: "progress"; task: SlayerAssignedTask }
    | { kind: "completed"; pointsAwarded: number; totalPoints: number; streak: number };

/**
 * Shared "one task just finished" bookkeeping — streak, total-completed
 * count, and points (with streak bonus + reward-shop multiplier applied).
 * Used by both a real final kill (handleNpcKilled) and the ::completeTask
 * debug command (completeActiveTaskInstantly), so the two paths can never
 * drift on how points/streak are computed.
 */
function finishTask(player: PlayerState, task: SlayerAssignedTask): { pointsAwarded: number; totalPoints: number; streak: number } {
    const master = getSlayerMaster(task.masterId);
    const streak = incrementSlayerStreak(player);
    slayerTaskTracker.incrementTotalCompleted(player.id);

    let pointsAwarded = master?.pointsPerTask ?? 0;
    if (streak > 0 && streak % STREAK_BONUS_INTERVAL === 0) pointsAwarded += STREAK_BONUS_POINTS;
    pointsAwarded = Math.round(pointsAwarded * getPointsMultiplier(player.id));

    const totalPoints = addSlayerPoints(player, pointsAwarded);
    return { pointsAwarded, totalPoints, streak };
}

/**
 * Called from the confirmed-kill hook (services.combat.registerOnNpcKilled —
 * the same choke point AchievementTaskTracker.checkKillTrigger uses). Grants
 * Slayer XP only while the kill matches the player's active task, matching
 * real OSRS behaviour (no task, no Slayer XP from combat).
 */
export function handleNpcKilled(player: PlayerState, npc: NpcState, services: ScriptServices): NpcKillOutcome {
    const task = slayerTaskTracker.getTask(player.id);
    if (!task) return { kind: "no-task" };

    const categoryKeys = getCategoryKeysForNpc(npc.typeId);
    if (!categoryKeys.includes(task.categoryKey)) {
        // Always carries the real npcTypeId/name — SlayerNpcCategoryMap.ts's
        // table is the only source of truth now (no name-matching fallback;
        // see that file for why), so an unmapped monster otherwise fails
        // silently forever. SlayerCombatHooks.ts surfaces this to the
        // player so it can be fixed with ::addslayernpc.
        return {
            kind: "not-a-match",
            npcTypeId: npc.typeId,
            npcName: npc.name,
            expectedCategoryKey: task.categoryKey,
        };
    }

    const category = getSlayerCategory(task.categoryKey);
    if (category) services.skills.addSkillXp(player, SkillId.Slayer, category.xpPerKill);

    const remaining = slayerTaskTracker.decrementTask(player.id);
    if (remaining) {
        return { kind: "progress", task: remaining };
    }

    const result = finishTask(player, task);
    return { kind: "completed", ...result };
}

export type CompleteTaskInstantlyResult =
    | { kind: "no-task" }
    | { kind: "completed"; task: SlayerAssignedTask; xpGranted: number; pointsAwarded: number; totalPoints: number; streak: number };

/**
 * ::completeTask debug command support — grants the Slayer XP for every
 * remaining kill in the active task (as if they'd all just been landed)
 * and runs the same completion bookkeeping a real final kill would, so
 * testing task-completion/points/streak doesn't require actually grinding
 * out however many kills were assigned.
 */
export function completeActiveTaskInstantly(player: PlayerState, services: ScriptServices): CompleteTaskInstantlyResult {
    const task = slayerTaskTracker.getTask(player.id);
    if (!task) return { kind: "no-task" };

    const category = getSlayerCategory(task.categoryKey);
    const xpGranted = (category?.xpPerKill ?? 0) * task.remainingAmount;
    if (category && xpGranted > 0) services.skills.addSkillXp(player, SkillId.Slayer, xpGranted);

    slayerTaskTracker.setTask(player.id, undefined);
    const result = finishTask(player, task);
    return { kind: "completed", task, xpGranted, ...result };
}

export { getCategoryNpcIds };
