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
 *
 * Points and streak are NOT tracked here — they live directly in the real
 * OSRS varbits (see SlayerVarbitSync.ts), which already persist per
 * account via PlayerVarpState's own serialize/deserialize. Only active
 * task assignment and one-time reward unlocks live here, since neither
 * has a real-OSRS varbit equivalent to piggyback on.
 */
export class SlayerTaskTracker {
    private readonly tasks = new Map<number, SlayerAssignedTask>();
    private readonly totalCompleted = new Map<number, number>();
    private readonly unlocks = new Map<number, Set<string>>();

    resetPlayer(playerId: number): void {
        this.tasks.delete(playerId);
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
        const totalCompleted = this.totalCompleted.get(playerId) ?? 0;
        const unlocks = [...(this.unlocks.get(playerId) ?? [])];

        if (!task && totalCompleted === 0 && unlocks.length === 0) {
            return undefined;
        }
        return {
            ...(task ? { task } : {}),
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
