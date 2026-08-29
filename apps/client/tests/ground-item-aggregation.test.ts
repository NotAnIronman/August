import assert from "node:assert/strict";

import { GroundItemStore } from "@client/engine/game/data/ground/GroundItemStore";
import { GroundItemsPlugin } from "@client/features/plugins/grounditems/GroundItemsPlugin";

const store = new GroundItemStore();
store.setMetadataResolver((itemId) => ({
    name: itemId === 532 ? "Big bones" : "Coins",
    gePrice: itemId === 532 ? 300 : 1,
    haPrice: 0,
    tradeable: true,
}));

store.update({
    kind: "snapshot",
    serial: 1,
    stacks: [
        {
            id: 11,
            itemId: 532,
            quantity: 1,
            tile: { x: 3200, y: 3200, level: 0 },
            createdTick: 10,
            expiresTick: 100,
            ownerId: 42,
            ownership: 1,
        },
        {
            id: 12,
            itemId: 532,
            quantity: 1,
            tile: { x: 3200, y: 3200, level: 0 },
            createdTick: 11,
            expiresTick: 90,
            ownerId: 42,
            ownership: 1,
        },
        {
            id: 13,
            itemId: 532,
            quantity: 1,
            tile: { x: 3200, y: 3200, level: 0 },
            createdTick: 12,
            expiresTick: 110,
            ownerId: 42,
            ownership: 1,
        },
        {
            id: 20,
            itemId: 995,
            quantity: 50,
            tile: { x: 3200, y: 3200, level: 0 },
            ownership: 0,
        },
        {
            id: 30,
            itemId: 532,
            quantity: 1,
            tile: { x: 3201, y: 3200, level: 0 },
            ownership: 0,
        },
    ],
});

const tileStacks = store.getStacksAt(3200, 3200, 0);
assert.equal(tileStacks.length, 2, "one client pile is exposed per item and ownership class");
const bones = tileStacks.find((stack) => stack.itemId === 532);
assert.ok(bones);
assert.equal(bones.quantity, 3);
assert.equal(bones.id, 12, "the soonest-despawning physical item is picked first");
assert.deepEqual(bones.sourceStackIds, [12, 11, 13]);
assert.equal(store.getStackById(12)?.quantity, 1, "authoritative records remain individual");
assert.equal(store.getAllStacks().length, 3, "the same item on another tile is a separate pile");
assert.equal(store.getStacksInRadius(3200, 3200, 0).length, 3);

const plugin = new GroundItemsPlugin();
plugin.setConfig({ priceDisplayMode: "off" });
assert.equal(plugin.evaluateStack(bones).baseLabel, "Big bones x 3");
assert.equal(plugin.getMenuTargetName(bones), "Big bones x 3");

store.update({ kind: "delta", serial: 2, upserts: [], removes: [12] });
const afterPickup = store.getStacksAt(3200, 3200, 0).find((stack) => stack.itemId === 532);
assert.ok(afterPickup);
assert.equal(afterPickup.quantity, 2);
assert.equal(afterPickup.id, 11, "the next physical item becomes the authoritative target");

store.update({
    kind: "delta",
    serial: 3,
    upserts: [
        {
            id: 14,
            itemId: 532,
            quantity: 1,
            tile: { x: 3200, y: 3200, level: 0 },
            ownerId: 99,
            ownership: 2,
        },
    ],
    removes: [],
});
assert.equal(
    store.getStacksAt(3200, 3200, 0).filter((stack) => stack.itemId === 532).length,
    2,
    "ownership classes remain separate for account-mode filtering",
);

console.log("ground-item-aggregation.test.ts: all assertions passed");
