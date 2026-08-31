import assert from "node:assert/strict";

import type { ServerServices } from "@server/game/ServerServices";
import { PlayerDeathService } from "@server/game/death/PlayerDeathService";
import { PlayerInstanceGraveState } from "@server/game/state/PlayerInstanceGraveState";
import { PlayerInventoryState } from "@server/game/state/PlayerInventoryState";
import {
    DeathType,
    ItemSourceType,
    type DeathContext,
    type ValuedItem,
} from "@server/game/death/types";
import type { PlayerState } from "@server/game/player";

function valuedItem(
    itemId: number,
    source: ValuedItem["source"],
): ValuedItem {
    return {
        itemId,
        quantity: 1,
        source,
        value: itemId,
        tradeable: true,
        alwaysKept: false,
        definition: undefined,
    };
}

function makePlayer(): PlayerState {
    const items = new PlayerInventoryState();
    items.inventory = Array.from({ length: 28 }, (_, slot) => ({
        itemId: 1_000 + slot,
        quantity: 1,
    }));
    items.setItemDefResolver(() => ({ stackable: false }));
    return {
        id: 42,
        items,
        getInventoryEntries: () => items.getInventoryEntries(),
        markInventoryDirty: () => items.markInventoryDirty(),
        markEquipmentDirty: () => undefined,
        appearance: {
            equip: Array.from({ length: 14 }, () => -1),
            equipQty: Array.from({ length: 14 }, () => 0),
        },
        instanceGrave: new PlayerInstanceGraveState(),
    } as unknown as PlayerState;
}

const service = new PlayerDeathService({
    ticker: { currentTick: () => 100 },
    locationService: {
        replaceTemporaryLoc: () => ({}),
        clearTemporaryLoc: () => true,
    },
    groundItems: { spawn: () => undefined },
} as unknown as ServerServices);

const player = makePlayer();
const equipmentSlot = 3;
const keptItemId = 2_000;
const lostItemId = player.getInventoryEntries()[0].itemId;
player.appearance!.equip![equipmentSlot] = keptItemId;
player.appearance!.equipQty![equipmentSlot] = 1;

const kept = valuedItem(keptItemId, {
    type: ItemSourceType.Equipment,
    slot: equipmentSlot,
});
const lost = valuedItem(lostItemId, {
    type: ItemSourceType.Inventory,
    slot: 0,
});
const context = {
    player,
    deathType: DeathType.DANGEROUS,
    wasSkulled: false,
    hadProtectItem: false,
    deathLocation: { x: 2_872, y: 5_358, level: 2 },
    wildernessLevel: 0,
    deathTick: 100,
    wasInInstance: true,
    itemProtection: {
        kept: [kept],
        lost: [lost],
        baseProtectionCount: 3,
        protectItemActive: false,
        skulled: false,
        totalLostValue: lost.value,
    },
} as DeathContext;

(service as unknown as {
    processItemsOnDeath(
        player: PlayerState,
        context: DeathContext,
        storeInInstanceGrave: boolean,
    ): void;
}).processItemsOnDeath(player, context, true);

assert.deepEqual(
    player.getInventoryEntries()[0],
    { itemId: keptItemId, quantity: 1 },
    "lost inventory is cleared before protected equipment is inserted",
);
assert.equal(
    player.appearance!.equip![equipmentSlot],
    -1,
    "protected equipment is unequipped only after complete insertion",
);
assert.deepEqual(player.instanceGrave.serialize()?.items, [
    { itemId: lostItemId, quantity: 1 },
]);

const fullPlayer = makePlayer();
fullPlayer.appearance!.equip![equipmentSlot] = keptItemId;
fullPlayer.appearance!.equipQty![equipmentSlot] = 1;
const moved = (service as unknown as {
    moveEquipmentToInventory(player: PlayerState, item: ValuedItem): boolean;
}).moveEquipmentToInventory(fullPlayer, kept);
assert.equal(moved, false);
assert.equal(
    fullPlayer.appearance!.equip![equipmentSlot],
    keptItemId,
    "a protected item remains equipped when inventory insertion cannot complete",
);
assert.equal(
    fullPlayer.getInventoryEntries().some((entry) => entry.itemId === keptItemId),
    false,
    "a failed transfer does not duplicate the protected item",
);

console.log("player death item transfer tests passed");
