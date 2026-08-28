import type { PersistentSubState } from "./PersistentSubState";

export interface InstanceGraveItem {
    itemId: number;
    quantity: number;
}

export interface InstanceGraveSnapshot {
    items?: InstanceGraveItem[];
    /** Reserved for configurable reclaim fees; free until a fee is configured. */
    reclaimCost?: number;
}

/** Persistent item storage for deaths in instanced encounters. */
export class PlayerInstanceGraveState implements PersistentSubState<InstanceGraveSnapshot | undefined> {
    private static readonly MAX_STACK_QUANTITY = 2_147_483_647;
    private items: InstanceGraveItem[] = [];
    private reclaimCost = 0;

    hasItems(): boolean {
        return this.items.length > 0;
    }

    getReclaimCost(): number {
        return this.reclaimCost;
    }

    /** Marks a successfully collected fee so a partial reclaim cannot charge twice. */
    markReclaimCostPaid(): void {
        this.reclaimCost = 0;
    }

    getItemCount(): number {
        return this.items.length;
    }

    private chunkItems(items: readonly InstanceGraveItem[]): InstanceGraveItem[] {
        const chunksByItemId = new Map<number, number[]>();
        for (const item of items) {
            const itemId = Math.trunc(item.itemId);
            if (itemId <= 0 || !Number.isFinite(item.quantity) || item.quantity <= 0) continue;
            let quantity = Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(item.quantity));
            const chunks = chunksByItemId.get(itemId) ?? [];
            while (quantity > 0) {
                const lastIndex = chunks.length - 1;
                const current = lastIndex >= 0 ? chunks[lastIndex] : 0;
                const added = Math.min(
                    quantity,
                    PlayerInstanceGraveState.MAX_STACK_QUANTITY - current,
                );
                if (lastIndex >= 0 && current < PlayerInstanceGraveState.MAX_STACK_QUANTITY) {
                    chunks[lastIndex] = current + added;
                } else {
                    chunks.push(added);
                }
                quantity -= added;
            }
            chunksByItemId.set(itemId, chunks);
        }
        return [...chunksByItemId].flatMap(([itemId, chunks]) =>
            chunks.map((quantity) => ({ itemId, quantity })),
        );
    }

    store(items: readonly InstanceGraveItem[], reclaimCost = 0): void {
        this.items = this.chunkItems(items);
        this.reclaimCost = Math.max(0, Math.trunc(reclaimCost));
    }

    /** Add another instanced death without discarding an unreclaimed grave. */
    deposit(items: readonly InstanceGraveItem[], reclaimCost = 0): void {
        this.items = this.chunkItems([...this.items, ...items]);
        this.reclaimCost = Math.max(this.reclaimCost, Math.max(0, Math.trunc(reclaimCost)));
    }

    reclaim(addItem: (itemId: number, quantity: number) => number): {
        reclaimed: number;
        remaining: number;
        reclaimCost: number;
    } {
        let reclaimed = 0;
        const reclaimCost = this.reclaimCost;
        const remaining: InstanceGraveItem[] = [];
        for (const item of this.items) {
            const added = Math.max(0, Math.min(item.quantity, Math.trunc(addItem(item.itemId, item.quantity))));
            reclaimed += added;
            if (added < item.quantity) remaining.push({ itemId: item.itemId, quantity: item.quantity - added });
        }
        this.items = remaining;
        if (remaining.length === 0) this.reclaimCost = 0;
        return { reclaimed, remaining: remaining.length, reclaimCost };
    }

    serialize(): InstanceGraveSnapshot | undefined {
        if (!this.hasItems()) return undefined;
        return {
            items: this.items.map((item) => ({ ...item })),
            ...(this.reclaimCost > 0 ? { reclaimCost: this.reclaimCost } : {}),
        };
    }

    deserialize(data: InstanceGraveSnapshot | undefined): void {
        this.items = this.chunkItems(Array.isArray(data?.items) ? data.items : []);
        this.reclaimCost = Math.max(0, Math.trunc(data?.reclaimCost ?? 0));
    }
}
