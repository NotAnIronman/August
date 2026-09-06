export type LootSource = "barrows" | "lunar";
export type PendingLoot = { source: LootSource; items: Array<{itemId:number;quantity:number}> };

/** Rolled, unclaimed rewards are account state, never a transient UI callback. */
export function sanitizePendingLoot(raw: unknown): PendingLoot[] {
    if (!Array.isArray(raw)) return [];
    const result: PendingLoot[] = [];
    for (const entry of raw.slice(0, 2)) {
        if (!entry || !["barrows", "lunar"].includes(entry.source) || !Array.isArray(entry.items) ||
            entry.items.length > 16 || result.some(e => e.source === entry.source)) continue;
        const items = entry.items.filter((i: any) => i && Number.isSafeInteger(i.itemId) && i.itemId > 0 && i.itemId <= 2147483647 &&
            Number.isSafeInteger(i.quantity) && i.quantity >= 0 && i.quantity <= 2147483647)
            .map((i: any) => ({itemId:i.itemId,quantity:i.quantity}));
        if (items.length === entry.items.length && items.some((i: any) => i.quantity > 0))
            result.push({source:entry.source,items});
    }
    return result;
}
