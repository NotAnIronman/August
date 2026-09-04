import { getFollowerDefinitionByItemId } from "@server/game/followers/followerDefinitions";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

type PetRewardServices = Pick<ScriptServices, "followers" | "inventory" | "banking" | "collectionLog" | "messaging">;

/** Try delivery without crediting the log again when a deferred reward is retried. */
function deliverPetReward(
    player: PlayerState,
    itemId: number,
    quantity: number,
    services: PetRewardServices,
): number {
    const definition = getFollowerDefinitionByItemId(itemId);
    if (!definition || !Number.isSafeInteger(quantity) || quantity <= 0) return quantity;
    let remaining = quantity;
    if (!player.followers.getState()) {
        const summoned = services.followers?.summonFollowerFromItem(player, itemId, definition.npcTypeId);
        if (summoned?.ok) {
            remaining--;
            services.messaging.sendGameMessage(player, "You have a funny feeling like you're being followed.");
        }
    }
    if (remaining > 0) {
        const result = services.inventory.addItemToInventory(player, itemId, remaining);
        remaining -= Math.min(remaining, Math.max(0, result.added));
        if (result.added > 0) services.inventory.snapshotInventory(player);
    }
    if (remaining > 0 && services.banking?.addItemToBank?.(player, itemId, remaining)) {
        remaining = 0;
        player.items.bankDirty = true;
        services.banking.queueBankSnapshot?.(player);
        services.messaging.sendGameMessage(player, "Your new pet has been sent to your bank.");
    }
    return remaining;
}

/** New acquisitions only; returns false for an item that is not a supported pet. */
export function awardPetReward(player: PlayerState, itemId: number, quantity: number, services: PetRewardServices): boolean {
    if (!getFollowerDefinitionByItemId(itemId) || !Number.isSafeInteger(quantity) || quantity <= 0) return false;
    const remaining = deliverPetReward(player, itemId, quantity, services);
    if (remaining > 0) {
        player.followers.deferReward(itemId, remaining);
        services.messaging.sendGameMessage(player, "Your inventory and bank are full. Your pet reward is saved and will arrive when you make space.");
    }
    services.collectionLog.trackCollectionLogItem(player, itemId);
    return true;
}

export function deliverPendingPetRewards(player: PlayerState, services: PetRewardServices): void {
    const pending = player.followers.getPendingRewards();
    if (!pending.length) return;
    const remaining = [];
    for (const reward of pending) {
        const quantity = deliverPetReward(player, reward.itemId, reward.quantity, services);
        if (quantity > 0) remaining.push({ itemId: reward.itemId, quantity });
    }
    player.followers.setPendingRewards(remaining);
}
