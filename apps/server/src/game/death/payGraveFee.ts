import type { PlayerState } from "@server/game/player";
/** Caller snapshots inventory, bank and grave and commits all three atomically. */
export function payGraveFee(player: PlayerState, cost: number, allowStoredCoins: boolean): boolean {
    if (cost <= 0)
        return true;
    const inventory = player.items.getInventoryEntries();
    const bank = allowStoredCoins ? (player.items.bank ?? []).filter(i => !i.placeholder && !i.filler) : [];
    const grave = player.instanceGrave.serialize();
    const recovered = allowStoredCoins ? grave?.items ?? [] : [];
    const total = [...inventory, ...bank, ...recovered].reduce((n, i) => n + (i.itemId === 995 ? i.quantity : 0), 0);
    if (total < cost)
        return false;
    let left = cost;
    const consume = (entries: {
        itemId: number;
        quantity: number;
    }[]) => {
        for (const item of entries) {
            if (item.itemId !== 995 || left === 0)
                continue;
            const taken = Math.min(left, item.quantity);
            item.quantity -= taken;
            left -= taken;
        }
    };
    consume(inventory);
    consume(bank);
    consume(recovered);
    for (const i of inventory)
        if (i.quantity <= 0) {
            i.itemId = -1;
            i.quantity = 0;
        }
    if (allowStoredCoins)
        player.items.bank = player.items.bank.filter(i => i.quantity > 0 || i.placeholder || i.filler);
    if (allowStoredCoins && grave)
        player.instanceGrave.deserialize({ ...grave, items: recovered.filter(i => i.quantity > 0) });
    player.instanceGrave.markReclaimCostPaid();
    player.items.inventoryDirty = true;
    player.items.bankDirty = true;
    return true;
}
