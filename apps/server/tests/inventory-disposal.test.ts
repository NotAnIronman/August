import assert from "node:assert/strict";
import type { WebSocket } from "ws";

import { loadItemDefinitions } from "@server/data/items";
import { getFollowerDefinitionByItemId } from "@server/game/followers/followerDefinitions";
import { InventoryMessageService } from "@server/game/services/InventoryMessageService";

const item = loadItemDefinitions().find(def => def.id > 0 && !def.dropable && (def.dropValue || def.value || 0) < 30000 && !getFollowerDefinitionByItemId(def.id))!;
assert(item, "fixture must exercise a legacy non-dropable item");
function setup(action = "Drop", itemId = item.id) {
    const inventory = [{ itemId, quantity: 1 }];
    const dialogs: any[] = [], drops: any[] = [], messages: any[] = [];
    let allowDrop = true, snapshots = 0, summonOk = true;
    const service = new InventoryMessageService({
        getPlayer: () => ({ id: 42, tileX: 3200, tileY: 3200, level: 0, worldViewId: -1 }),
        getInventory: () => inventory,
        getObjType: () => ({ inventoryActions: [null, null, null, null, action] }),
        resolveEquipSlot: () => undefined,
        getCurrentTick: () => 1,
        queueItemAction: () => false,
        closeInterruptibleInterfaces() {},
        openDialogOptions: (_p: any, dialog: any) => dialogs.push(dialog),
        setInventorySlot: (_p: any, slot: number, id: number, quantity: number) => { inventory[slot] = { itemId: id, quantity }; },
        spawnGroundItem: (...args: any[]) => { if (!allowDrop) return undefined; drops.push(args); return { id: 1 }; },
        summonFollowerFromItem: () => summonOk ? { ok: true, npcId: 7 } : { ok: false, reason: "already_active" },
        withDirectSendBypass: (_name: string, fn: () => unknown) => fn(),
        sendSound() {},
        queueChatMessage: (message: any) => messages.push(message),
        checkAndSendSnapshots: () => snapshots++,
    } as any);
    return {
        inventory, dialogs, drops, messages,
        use: (option?: string) => service.handleInventoryUseMessage({} as WebSocket, { slot: 0, itemId, op: 5, option }),
        blockDrop: () => { allowDrop = false; },
        blockSummon: () => { summonOk = false; },
        snapshotCount: () => snapshots,
    };
}
const ordinary = setup();
ordinary.use();
assert.equal(ordinary.drops.length, 1, "legacy dropable=false must not block normal Drop");
assert.equal(ordinary.inventory[0].quantity, 0);
assert.equal(ordinary.snapshotCount(), 1);
const fullTile = setup();
fullTile.blockDrop();
fullTile.use();
assert.equal(fullTile.inventory[0].itemId, item.id, "failed ground spawn must retain inventory");
assert.equal(fullTile.messages.length, 1);
for (const action of ["Destroy", "Discard"]) {
    const destroy = setup(action);
    destroy.use("Drop");
    assert.equal(destroy.drops.length, 0, "forged Drop cannot bypass Destroy");
    assert.equal(destroy.inventory[0].quantity, 1, "confirmation precedes removal");
    destroy.dialogs[0].onSelect(1);
    assert.equal(destroy.inventory[0].quantity, 1, "cancel keeps item");
    destroy.dialogs[0].onSelect(0);
    assert.equal(destroy.inventory[0].quantity, 0);
    assert.equal(destroy.snapshotCount(), 1);
    const stale = setup(action);
    stale.use();
    stale.inventory[0].quantity = 2;
    stale.dialogs[0].onSelect(0);
    assert.equal(stale.inventory[0].quantity, 2, "stale confirmation cannot destroy changed stack");
}
const pet = setup("Drop", 29836);
pet.use();
assert.equal(pet.drops.length, 0, "a pet becomes a follower, never an item model on the floor");
assert.equal(pet.inventory[0].quantity, 0);
const activePet = setup("Drop", 29836);
activePet.blockSummon();
activePet.use();
assert.equal(activePet.inventory[0].quantity, 1, "existing follower prevents pet item loss");
assert.equal(activePet.drops.length, 0);
for (let itemId = 1555; itemId <= 1572; itemId++) {
    const cat = setup("Drop", itemId);
    cat.use();
    assert.equal(cat.drops.length, 0, `cat ${itemId} must not render as a floor item`);
    assert.equal(cat.inventory[0].quantity, 0);
    const colour = (itemId - 1555) % 6;
    const baseNpc = itemId < 1561 ? 5591 : itemId < 1567 ? 1619 : 5598;
    assert.equal(getFollowerDefinitionByItemId(itemId)?.npcTypeId, baseNpc + colour);
}
console.log("inventory Drop/Destroy and pet-drop regressions passed");
