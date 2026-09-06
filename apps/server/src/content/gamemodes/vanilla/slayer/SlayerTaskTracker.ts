import { getSlayerMaster } from "@server/content/gamemodes/vanilla/slayer/SlayerMasterDefinitions";
import { getSlayerCategory } from "@server/content/gamemodes/vanilla/slayer/SlayerMonsterCategories";
import type {
    SlayerAssignedTask,
    SlayerPersistentState,
} from "@server/content/gamemodes/vanilla/slayer/types";

/**
 * In-memory Slayer state, keyed by playerId — same shape/lifecycle as
 * AchievementTaskTracker (diary-tasks/AchievementTaskTracker.ts): reset on
 * login before restore, exported/imported as a JSON blob via
 * VanillaGamemode.serializePlayerState/deserializePlayerState.
 */
export class SlayerTaskTracker {
    private readonly tasks = new Map<number, SlayerAssignedTask>();
    private readonly points = new Map<number, number>();
    private readonly streaks = new Map<number, number>();
    private readonly totalCompleted = new Map<number, number>();
    private readonly unlocks = new Map<number, Set<string>>();

    resetPlayer(playerId: number): void {
        this.tasks.delete(playerId);
        this.points.delete(playerId);
        this.streaks.delete(playerId);
        this.totalCompleted.delete(playerId);
        this.unlocks.delete(playerId);
    }

    getTask(playerId: number): SlayerAssignedTask | undefined {
        return this.tasks.get(playerId);
    }

    setTask(playerId: number, task: SlayerAssignedTask | undefined): void {
        if (task) this.tasks.set(playerId, task);
        else this.tasks.delete(playerId);
    }

    /** Decrements remaining count by one; returns the updated task (undefined once cleared). */
    decrementTask(playerId: number): SlayerAssignedTask | undefined {
        const task = this.tasks.get(playerId);
        if (!task) return undefined;
        const next: SlayerAssignedTask = { ...task, remainingAmount: Math.max(0, task.remainingAmount - 1) };
        if (next.remainingAmount <= 0) {
            this.tasks.delete(playerId);
            return undefined;
        }
        this.tasks.set(playerId, next);
        return next;
    }

    /** Per-account point balance — a plain counter, not an item. See SlayerRewardsPanel.ts. */
    getPoints(playerId: number): number {
        return this.points.get(playerId) ?? 0;
    }

    addPoints(playerId: number, amount: number): number {
        const next = Math.max(0, this.getPoints(playerId) + amount);
        this.points.set(playerId, next);
        return next;
    }

    /** Returns false (and leaves points unchanged) if the player can't afford it. */
    spendPoints(playerId: number, amount: number): boolean {
        const current = this.getPoints(playerId);
        if (current < amount) return false;
        this.points.set(playerId, current - amount);
        return true;
    }

    getStreak(playerId: number): number {
        return this.streaks.get(playerId) ?? 0;
    }

    incrementStreak(playerId: number): number {
        const next = this.getStreak(playerId) + 1;
        this.streaks.set(playerId, next);
        return next;
    }

    resetStreak(playerId: number): void {
        this.streaks.delete(playerId);
    }

    getTotalCompleted(playerId: number): number {
        return this.totalCompleted.get(playerId) ?? 0;
    }

    incrementTotalCompleted(playerId: number): number {
        const next = this.getTotalCompleted(playerId) + 1;
        this.totalCompleted.set(playerId, next);
        return next;
    }

    hasUnlock(playerId: number, unlockKey: string): boolean {
        return this.unlocks.get(playerId)?.has(unlockKey) ?? false;
    }

    grantUnlock(playerId: number, unlockKey: string): void {
        let set = this.unlocks.get(playerId);
        if (!set) {
            set = new Set();
            this.unlocks.set(playerId, set);
        }
        set.add(unlockKey);
    }

    serializePlayerState(playerId: number): SlayerPersistentState | undefined {
        const task = this.tasks.get(playerId);
        const points = this.points.get(playerId) ?? 0;
        const streak = this.streaks.get(playerId) ?? 0;
        const totalCompleted = this.totalCompleted.get(playerId) ?? 0;
        const unlocks = [...(this.unlocks.get(playerId) ?? [])];

        if (!task && points === 0 && streak === 0 && totalCompleted === 0 && unlocks.length === 0) {
            return undefined;
        }
        return {
            ...(task ? { task } : {}),
            ...(points > 0 ? { points } : {}),
            ...(streak > 0 ? { streak } : {}),
            ...(totalCompleted > 0 ? { totalCompleted } : {}),
            ...(unlocks.length > 0 ? { unlocks } : {}),
        };
    }

    deserializePlayerState(playerId: number, data: unknown): void {
        this.resetPlayer(playerId);
        if (!data || typeof data !== "object" || Array.isArray(data)) return;
        const state = data as SlayerPersistentState;

        if (state.task && this.isValidTask(state.task)) {
            this.tasks.set(playerId, {
                masterId: state.task.masterId,
                categoryKey: state.task.categoryKey,
                assignedAmount: Math.max(1, Math.floor(state.task.assignedAmount)),
                remainingAmount: Math.max(0, Math.floor(state.task.remainingAmount)),
            });
        }
        if (typeof state.points === "number" && Number.isFinite(state.points) && state.points > 0) {
            this.points.set(playerId, Math.floor(state.points));
        }
        if (typeof state.streak === "number" && Number.isFinite(state.streak) && state.streak > 0) {
            this.streaks.set(playerId, Math.floor(state.streak));
        }
        if (
            typeof state.totalCompleted === "number" &&
            Number.isFinite(state.totalCompleted) &&
            state.totalCompleted > 0
        ) {
            this.totalCompleted.set(playerId, Math.floor(state.totalCompleted));
        }
        if (Array.isArray(state.unlocks) && state.unlocks.length > 0) {
            const set = new Set(state.unlocks.filter((key): key is string => typeof key === "string"));
            if (set.size > 0) this.unlocks.set(playerId, set);
        }
    }

    private isValidTask(task: SlayerAssignedTask): boolean {
        if (!task || typeof task !== "object") return false;
        if (typeof task.masterId !== "string" || !getSlayerMaster(task.masterId)) return false;
        if (typeof task.categoryKey !== "string" || !getSlayerCategory(task.categoryKey)) return false;
        return (
            Number.isFinite(task.assignedAmount) &&
            Number.isFinite(task.remainingAmount) &&
            task.remainingAmount >= 0
        );
    }
}

export const slayerTaskTracker = new SlayerTaskTracker();
