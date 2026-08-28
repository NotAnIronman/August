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
    private items: InstanceGraveItem[] = [];
    private reclaimCost = 0;

    hasItems(): boolean {
        return this.items.length > 0;
    }

    getItemCount(): number {
        return this.items.length;
    }

    store(items: readonly InstanceGraveItem[], reclaimCost = 0): void {
        this.items = items
            .filter((item) => item.itemId > 0 && item.quantity > 0)
            .map((item) => ({ itemId: Math.trunc(item.itemId), quantity: Math.trunc(item.quantity) }));
        this.reclaimCost = Math.max(0, Math.trunc(reclaimCost));
    }

    reclaim(addItem: (itemId: number, quantity: number) => number): {
        reclaimed: number;
        remaining: number;
        reclaimCost: number;
    } {
        let reclaimed = 0;
        const remaining: InstanceGraveItem[] = [];
        for (const item of this.items) {
            const added = Math.max(0, Math.min(item.quantity, Math.trunc(addItem(item.itemId, item.quantity))));
            reclaimed += added;
            if (added < item.quantity) remaining.push({ itemId: item.itemId, quantity: item.quantity - added });
        }
        this.items = remaining;
        return { reclaimed, remaining: remaining.length, reclaimCost: this.reclaimCost };
    }

    serialize(): InstanceGraveSnapshot | undefined {
        if (!this.hasItems()) return undefined;
        return {
            items: this.items.map((item) => ({ ...item })),
            ...(this.reclaimCost > 0 ? { reclaimCost: this.reclaimCost } : {}),
        };
    }

    deserialize(data: InstanceGraveSnapshot | undefined): void {
        this.items = Array.isArray(data?.items)
            ? data.items
                  .filter((item) => item?.itemId > 0 && item?.quantity > 0)
                  .map((item) => ({ itemId: Math.trunc(item.itemId), quantity: Math.trunc(item.quantity) }))
            : [];
        this.reclaimCost = Math.max(0, Math.trunc(data?.reclaimCost ?? 0));
    }
}
