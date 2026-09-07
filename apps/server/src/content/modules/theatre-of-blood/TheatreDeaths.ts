import type { PlayerState } from "@server/game/player";
import type { TheatreRunRecord, TheatreRunStore } from "./TheatreRun";
import { raidAccount } from "./MaidenEncounter";
export const THEATRE_GRAVE = { locId: 32656, tile: { x: 3657, y: 3223 }, level: 0 } as const;
export const THEATRE_RECLAIM_COST = 100000;
export function recordTheatreDeath(run: TheatreRunRecord, player: PlayerState): void {
    run.deaths ??= Array.from({ length: 6 }, () => []);
    const dead = run.deaths[run.roomIndex], name = raidAccount(player);
    if (!dead.includes(name))
        dead.push(name);
    player.raidProgress.spectating = true;
    run.wiped = run.roster.every(n => dead.includes(n));
}
/** Move equipment and inventory into persistent storage exactly once, never to the floor.
 * The cleared checkpoint and grave are saved together; a failed save restores all sources.
 */
export function storeTheatreWipe(player: PlayerState, store: TheatreRunStore, save: () => void): boolean {
    const checkpoint = player.raidProgress.checkpoint;
    const run = checkpoint && store.load(checkpoint.runId);
    if (!run?.wiped || !run.roster.includes(raidAccount(player)))
        return false;
    const inventory = player.items.getInventoryEntries().map(i => ({ ...i }));
    const equip = [...(player.appearance.equip ?? [])], qty = [...(player.appearance.equipQty ?? [])];
    const grave = player.instanceGrave.serialize();
    const items = [...inventory, ...player.exportEquipmentSnapshot().map(i => ({ itemId: i.itemId, quantity: i.quantity ?? 1 }))].filter(i => i.itemId > 0 && i.quantity > 0);
    try {
        player.instanceGrave.store([...(grave?.items ?? []), ...items], Math.max(grave?.reclaimCost ?? 0, THEATRE_RECLAIM_COST), THEATRE_GRAVE);
        for (let i = 0; i < inventory.length; i++)
            player.items.setInventorySlot(i, -1, 0);
        player.appearance.equip = equip.map(() => -1);
        player.appearance.equipQty = qty.map(() => 0);
        player.markEquipmentDirty();
        player.raidProgress.clear();
        save();
    }
    catch (error) {
        player.items.inventory = inventory;
        player.items.inventoryDirty = true;
        player.appearance.equip = equip;
        player.appearance.equipQty = qty;
        player.markEquipmentDirty();
        player.instanceGrave.deserialize(grave);
        player.raidProgress.set(checkpoint!);
        throw error;
    }
    return true;
}
