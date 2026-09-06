import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import type { LootSource } from "@server/game/state/PlayerLootState";
import { openRewardDisplay, type VisualReward } from "./rewardDisplay";

const titles = {barrows:"Barrows chest",lunar:"Lunar chest"};

/** Return true when there is existing loot, so callers cannot reroll it. */
export function reopenPendingLoot(player: PlayerState, services: ScriptServices, source: LootSource): boolean {
    const reward = player.pendingLoot.find(r => r.source === source);
    if (!reward) return false;
    const show = () => openRewardDisplay(player,services,titles[source],reward.items.map(i => ({
        itemId:i.quantity > 0 ? i.itemId : -1, quantity:i.quantity,
    })), {source,claim:(destination,slot) => {
        if (!player.pendingLoot.includes(reward) || !player.canInteract()) return;
        const inventory = player.items.getInventoryEntries().map(i => ({...i}));
        const bank = player.items.bank.map(i => ({...i}));
        const log = player.collectionLog.serialize();
        const quantities = reward.items.map(i => i.quantity);
        const pending = [...player.pendingLoot];
        let moved = 0;
        try {
            reward.items.forEach((item,index) => {
                if ((slot !== undefined && slot !== index) || item.quantity <= 0) return;
                const count = destination === "destroy" ? item.quantity : destination === "bank"
                    ? (services.banking?.addItemToBank?.(player,item.itemId,item.quantity) ? item.quantity : 0)
                    : player.items.addItem(item.itemId,item.quantity,{assureFullInsertion:false}).completed;
                if (count <= 0) return;
                item.quantity -= count; moved += count;
                if(destination !== "destroy")services.collectionLog.trackCollectionLogItem(player,item.itemId);
            });
            if (moved) {
                if (reward.items.every(i => i.quantity === 0)) player.pendingLoot = pending.filter(r => r !== reward);
                services.appearance.savePlayerSnapshotChecked(player);
            }
        } catch (error) {
            player.items.inventory = inventory; player.items.inventoryDirty = true;
            player.items.bank = bank; player.items.bankDirty = true;
            player.collectionLog.deserialize(log);
            player.pendingLoot = pending;
            reward.items.forEach((i,index) => i.quantity = quantities[index]);
            services.inventory.snapshotInventory(player);
            services.collectionLog.sendCollectionLogSnapshot(player);
            services.system.logger.error("Reward claim could not be saved",error);
            services.messaging.sendGameMessage(player,"Nothing was claimed. Your loot remains in the chest; please try again.");
            show(); return;
        }
        services.inventory.snapshotInventory(player);
        services.collectionLog.sendCollectionLogSnapshot(player);
        if (!moved) services.messaging.sendGameMessage(player,"No items fit there. Your unclaimed loot stays in the chest.");
        if (player.pendingLoot.includes(reward)) show();
        else services.dialog.closeModal(player);
    }});
    show(); return true;
}

/** Commit the roll and completion state together, before making rewards claimable. */
export function storePendingLoot(player:PlayerState,services:ScriptServices,source:LootSource,
    items:readonly VisualReward[], complete:()=>void):boolean {
    if (reopenPendingLoot(player,services,source)) return false;
    if (items.length > 16 || items.some(i => i.quantity <= 0)) throw new Error("Invalid reward container");
    const previous = [...player.pendingLoot], moons = player.moons.serialize(), log = player.collectionLog.serialize();
    try {
        player.pendingLoot.push({source,items:items.map(i => ({...i}))});
        complete();
        services.appearance.savePlayerSnapshotChecked(player);
        return true;
    } catch(error) {
        player.pendingLoot = previous; player.moons.deserialize(moons); player.collectionLog.deserialize(log);
        services.system.logger.error("Reward roll could not be saved",error);
        services.messaging.sendGameMessage(player,"Your reward could not be saved. Please try the chest again.");
        return false;
    }
}
