import type { PlayerFollowerPersistentEntry } from "@server/game/player";
import type { PersistentSubState } from "@server/game/state/PersistentSubState";
import { getFollowerDefinitionByItemId } from "@server/game/followers/followerDefinitions";

export type PendingPetReward = { itemId: number; quantity: number };
export type PetDropSource = { bossNpcTypeId: number; bossName: string; killcount: number };
export type FirstPetDrop = PetDropSource & { petNpcTypeId: number };

export function sanitizeFirstPetDrops(value: unknown): FirstPetDrop[] {
    if (!Array.isArray(value)) return [];
    const first = new Map<number, FirstPetDrop>();
    for (const entry of value) {
        if (!entry || !Number.isSafeInteger(entry.petNpcTypeId) || entry.petNpcTypeId <= 0
            || !Number.isSafeInteger(entry.bossNpcTypeId) || entry.bossNpcTypeId <= 0
            || !Number.isSafeInteger(entry.killcount) || entry.killcount < 1
            || typeof entry.bossName !== "string" || !entry.bossName.trim()) continue;
        if (!first.has(entry.petNpcTypeId)) first.set(entry.petNpcTypeId, {
            petNpcTypeId: entry.petNpcTypeId, bossNpcTypeId: entry.bossNpcTypeId,
            bossName: entry.bossName.trim().slice(0, 100), killcount: entry.killcount,
        });
    }
    return [...first.values()];
}

export class PlayerFollowerPersistState implements PersistentSubState<
    PlayerFollowerPersistentEntry | undefined
> {
    private state?: PlayerFollowerPersistentEntry;
    private activeNpcId?: number;
    private pendingRewards: PendingPetReward[] = [];
    private firstPetDrops: FirstPetDrop[] = [];

    getFirstPetDrops(): FirstPetDrop[] { return this.firstPetDrops.map(entry => ({ ...entry })); }
    setFirstPetDrops(value: unknown): void { this.firstPetDrops = sanitizeFirstPetDrops(value); }
    getFirstPetDrop(itemId: number): FirstPetDrop | undefined {
        const id = getFollowerDefinitionByItemId(itemId)?.npcTypeId;
        return this.firstPetDrops.find(entry => entry.petNpcTypeId === id);
    }
    recordFirstPetDrop(itemId: number, source: PetDropSource): boolean {
        const petNpcTypeId = getFollowerDefinitionByItemId(itemId)?.npcTypeId;
        if (!petNpcTypeId || this.getFirstPetDrop(itemId)) return false;
        const valid = sanitizeFirstPetDrops([{ ...source, petNpcTypeId }]);
        if (!valid.length) return false;
        this.firstPetDrops.push(valid[0]);
        return true;
    }

    getPendingRewards(): readonly PendingPetReward[] {
        return this.pendingRewards;
    }

    setPendingRewards(rewards: readonly PendingPetReward[] | undefined): void {
        this.pendingRewards = (rewards ?? [])
            .filter(reward => reward && getFollowerDefinitionByItemId(reward.itemId)
                && Number.isSafeInteger(reward.quantity) && reward.quantity > 0)
            .map(reward => ({ ...reward }));
    }

    deferReward(itemId: number, quantity: number): void {
        this.setPendingRewards([...this.pendingRewards, { itemId, quantity }]);
    }

    getState(): PlayerFollowerPersistentEntry | undefined {
        return this.state;
    }

    setState(value?: PlayerFollowerPersistentEntry): void {
        if (
            !value ||
            !Number.isFinite(value.itemId) ||
            !Number.isFinite(value.npcTypeId) ||
            value.itemId <= 0 ||
            value.npcTypeId <= 0
        ) {
            this.state = undefined;
            return;
        }
        this.state = {
            itemId: value.itemId | 0,
            npcTypeId: value.npcTypeId | 0,
        };
    }

    clearState(): void {
        this.state = undefined;
    }

    getActiveNpcId(): number | undefined {
        return this.activeNpcId;
    }

    setActiveNpcId(npcId: number | undefined): void {
        if (npcId === undefined || !Number.isFinite(npcId) || npcId <= 0) {
            this.activeNpcId = undefined;
            return;
        }
        this.activeNpcId = npcId | 0;
    }

    serialize(): PlayerFollowerPersistentEntry | undefined {
        if (!this.state) return undefined;
        return {
            itemId: this.state.itemId,
            npcTypeId: this.state.npcTypeId,
        };
    }

    deserialize(data: PlayerFollowerPersistentEntry | undefined): void {
        this.setState(data);
        this.activeNpcId = undefined;
    }
}
