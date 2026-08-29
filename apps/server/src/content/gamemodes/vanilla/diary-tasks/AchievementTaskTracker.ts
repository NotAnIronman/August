import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { DIARY_AREA_TASKS } from "@server/content/gamemodes/vanilla/diary-tasks/index";
import type { DiaryTaskArea, DiaryTaskTrigger } from "@server/content/gamemodes/vanilla/diary-tasks/types";

/**
 * Achievement diary task auto-completion tracker.
 *
 * DESIGN NOTE - what's built vs. what's designed but not wired yet:
 *
 * The data schema (types.ts) supports five trigger types: kill, collect,
 * craft, interact, talk. Only `kill` is actually hooked into the game
 * right now (see checkKillTrigger, called from NpcHitHandler.
 * handleNpcDeath via CombatFacade.registerOnNpcKilled - the confirmed
 * single choke-point for "player X killed NPC of type Y", found by
 * tracing the real combat code rather than guessing). The other four
 * need their own hook-point investigation before wiring:
 *   - collect: wherever items get added to a player's inventory/bank
 *     (multiple entry points likely - loot pickup, trading, buying)
 *   - craft: wherever a skilling action grants its output item (varies
 *     per skill - smithing, cooking, fletching, etc. each have their own
 *     "produce item" completion point)
 *   - interact: wherever object click actions dispatch (doors, altars,
 *     agility obstacles, etc.)
 *   - talk: wherever NPC dialogue trees start/reach a specific node
 *
 * TIER COUNT NOTE: this tracker does NOT write to the old aggregate
 * countVarbit/completeVarbit fields on DiaryTier anymore (an earlier
 * version did, and that was actually a bug - it used the OLD hardcoded
 * tier total, e.g. 12, instead of however many tasks you've actually
 * filled in, e.g. 3, so the header showed "12/12" instead of "0/3").
 * diaryJournalWidgets.ts now computes the tier header/count/color
 * directly from the filled-in task list length + this tracker's
 * completion state whenever real task data exists for that tier, and
 * only falls back to the old varbits when a tier has no filled-in tasks
 * yet. Those old varbits are effectively unused now except as that
 * fallback - nothing writes to them.
 */

/** Rectangular tile bounds check - see DiaryTaskArea in types.ts. */
function matchesArea(area: DiaryTaskArea | undefined, x: number, y: number, level: number): boolean {
    if (!area) return true;
    if (x < area.minX || x > area.maxX || y < area.minY || y > area.maxY) return false;
    if (area.level !== undefined && area.level !== level) return false;
    return true;
}

type TaskLocation = { areaId: number; tierIndex: number; taskIndex: number };

/** JSON-safe per-player diary state stored in VanillaGamemode's save data. */
export type AchievementDiaryPersistentState = {
    completed?: string[];
    progress?: Record<string, number>;
};

/** Called after a task is newly completed, so the UI can refresh if open. */
export type TaskCompletedCallback = (
    player: PlayerState,
    areaId: number,
    tierIndex: number,
    services: ScriptServices,
) => void;

export class AchievementTaskTracker {
    /** playerId -> taskKey -> progress count (for triggers needing count > 1). */
    private readonly progress = new Map<number, Map<string, number>>();
    /** playerId -> Set of completed taskKeys. */
    private readonly completed = new Map<number, Set<string>>();

    onTaskCompleted: TaskCompletedCallback | undefined;

    private taskKey(loc: TaskLocation): string {
        return `${loc.areaId}:${loc.tierIndex}:${loc.taskIndex}`;
    }

    /** Clears an id's transient state before a newly-created player uses it. */
    resetPlayer(playerId: number): void {
        this.progress.delete(playerId);
        this.completed.delete(playerId);
    }

    /**
     * Exports one player's completed tasks and partial trigger progress in a
     * JSON-safe form. Player IDs are session-local, so only the values—not
     * the outer player-id map—belong in the persistent save.
     */
    serializePlayerState(playerId: number): AchievementDiaryPersistentState | undefined {
        const completed = [...(this.completed.get(playerId) ?? [])];
        const progress: Record<string, number> = {};
        for (const [key, value] of this.progress.get(playerId) ?? []) {
            if (value > 0) progress[key] = value;
        }
        if (completed.length === 0 && Object.keys(progress).length === 0) return undefined;
        return {
            ...(completed.length > 0 ? { completed } : {}),
            ...(Object.keys(progress).length > 0 ? { progress } : {}),
        };
    }

    /** Restores a player's JSON-safe diary state after loading their save. */
    deserializePlayerState(playerId: number, data: unknown): void {
        this.resetPlayer(playerId);
        if (!data || typeof data !== "object" || Array.isArray(data)) return;

        const state = data as AchievementDiaryPersistentState;
        const completed = new Set<string>();
        if (Array.isArray(state.completed)) {
            for (const key of state.completed) {
                if (typeof key === "string" && this.isValidTaskKey(key)) completed.add(key);
            }
        }
        if (completed.size > 0) this.completed.set(playerId, completed);

        const progress = new Map<string, number>();
        if (state.progress && typeof state.progress === "object" && !Array.isArray(state.progress)) {
            for (const [key, rawValue] of Object.entries(state.progress)) {
                const value = Math.floor(Number(rawValue));
                if (completed.has(key) || !this.isValidTaskKey(key) || !Number.isFinite(value) || value <= 0)
                    continue;
                progress.set(key, value);
            }
        }
        if (progress.size > 0) this.progress.set(playerId, progress);
    }

    /** Reject malformed or obsolete task keys from saved data. */
    private isValidTaskKey(key: string): boolean {
        const match = /^(\d+):(\d+):(\d+)$/.exec(key);
        if (!match) return false;
        const areaId = Number(match[1]);
        const tierIndex = Number(match[2]);
        const taskIndex = Number(match[3]);
        if (!Number.isSafeInteger(areaId) || !Number.isSafeInteger(tierIndex) || !Number.isSafeInteger(taskIndex))
            return false;
        const area = DIARY_AREA_TASKS[areaId];
        if (!area || tierIndex < 0 || tierIndex > 3 || taskIndex < 0) return false;
        const tier = [area.easy, area.medium, area.hard, area.elite][tierIndex];
        return taskIndex < tier.tasks.length;
    }

    isTaskComplete(playerId: number, loc: TaskLocation): boolean {
        return this.completed.get(playerId)?.has(this.taskKey(loc)) ?? false;
    }

    /** Number of completed tasks in a tier, out of the given task count. Used
     *  by diaryJournalWidgets.ts to render the "Easy 2/3" style header. */
    countCompletedInTier(playerId: number, areaId: number, tierIndex: number, taskCount: number): number {
        let count = 0;
        for (let taskIndex = 0; taskIndex < taskCount; taskIndex++) {
            if (this.isTaskComplete(playerId, { areaId, tierIndex, taskIndex })) count++;
        }
        return count;
    }

    /**
     * Records one unit of progress toward a task's trigger (e.g. one
     * kill of the required NPC). Marks the task complete once progress
     * reaches the trigger's required count (default 1) and fires
     * onTaskCompleted for a live UI refresh.
     */
    private recordProgress(
        player: PlayerState,
        loc: TaskLocation,
        requiredCount: number,
        services: ScriptServices,
    ): void {
        const key = this.taskKey(loc);
        if (this.completed.get(player.id)?.has(key)) return; // already done

        let playerProgress = this.progress.get(player.id);
        if (!playerProgress) {
            playerProgress = new Map();
            this.progress.set(player.id, playerProgress);
        }
        const next = (playerProgress.get(key) ?? 0) + 1;
        playerProgress.set(key, next);
        if (next < requiredCount) return;

        let playerCompleted = this.completed.get(player.id);
        if (!playerCompleted) {
            playerCompleted = new Set();
            this.completed.set(player.id, playerCompleted);
        }
        playerCompleted.add(key);
        playerProgress.delete(key);

        this.onTaskCompleted?.(player, loc.areaId, loc.tierIndex, services);
    }

    /**
     * Kill trigger - call this from the confirmed-kill hook
     * (wired via services.combat.registerOnNpcKilled, see
     * diaryJournalWidgets.ts) with the killed NPC. Checks every
     * filled-in kill-trigger task across all areas/tiers; cheap enough
     * at this scale (at most a few hundred tasks total) to just scan on
     * every kill rather than needing a reverse index. If the task
     * specifies an `area`, the NPC's kill location must fall within it.
     */
    checkKillTrigger(player: PlayerState, npc: NpcState, services: ScriptServices): void {
        this.forEachTaskWithTrigger((loc, trigger) => {
            if (trigger.type !== "kill" || trigger.npcId !== npc.typeId) return;
            if (!matchesArea(trigger.area, npc.tileX, npc.tileY, npc.level)) return;
            this.recordProgress(player, loc, trigger.count ?? 1, services);
        });
    }

    // Stubs for the remaining trigger types - schema-ready, not yet
    // hooked into anything (see the class doc comment). Call these once
    // the corresponding game hook point has been found and wired, the
    // same way checkKillTrigger is wired today.
    checkCollectTrigger(
        player: PlayerState,
        itemId: number,
        location: { x: number; y: number; level: number } | undefined,
        services: ScriptServices,
    ): void {
        this.forEachTaskWithTrigger((loc, trigger) => {
            if (trigger.type !== "collect" || trigger.itemId !== itemId) return;
            if (trigger.area && (!location || !matchesArea(trigger.area, location.x, location.y, location.level)))
                return;
            this.recordProgress(player, loc, trigger.count ?? 1, services);
        });
    }

    checkCraftTrigger(player: PlayerState, itemId: number, services: ScriptServices): void {
        this.forEachTaskWithTrigger((loc, trigger) => {
            if (trigger.type !== "craft" || trigger.itemId !== itemId) return;
            this.recordProgress(player, loc, trigger.count ?? 1, services);
        });
    }

    checkInteractTrigger(
        player: PlayerState,
        objectId: number,
        action: string | undefined,
        location: { x: number; y: number; level: number },
        services: ScriptServices,
    ): void {
        this.forEachTaskWithTrigger((loc, trigger) => {
            if (trigger.type !== "interact" || trigger.objectId !== objectId) return;
            if (trigger.action && trigger.action !== action) return;
            if (!matchesArea(trigger.area, location.x, location.y, location.level)) return;
            this.recordProgress(player, loc, trigger.count ?? 1, services);
        });
    }

    checkTalkTrigger(
        player: PlayerState,
        npc: NpcState,
        services: ScriptServices,
    ): void {
        this.forEachTaskWithTrigger((loc, trigger) => {
            if (trigger.type !== "talk" || trigger.npcId !== npc.typeId) return;
            if (!matchesArea(trigger.area, npc.tileX, npc.tileY, npc.level)) return;
            this.recordProgress(player, loc, 1, services);
        });
    }

    private forEachTaskWithTrigger(
        fn: (loc: TaskLocation, trigger: DiaryTaskTrigger) => void,
    ): void {
        for (let areaId = 0; areaId < DIARY_AREA_TASKS.length; areaId++) {
            const area = DIARY_AREA_TASKS[areaId];
            const tiers = [area.easy, area.medium, area.hard, area.elite];
            for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
                const tasks = tiers[tierIndex].tasks;
                for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
                    const trigger = tasks[taskIndex].trigger;
                    if (!trigger) continue;
                    fn({ areaId, tierIndex, taskIndex }, trigger);
                }
            }
        }
    }
}

export const achievementTaskTracker = new AchievementTaskTracker();
