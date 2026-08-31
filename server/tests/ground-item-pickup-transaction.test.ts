import assert from "node:assert/strict";

import type { ServerServices } from "../src/game/ServerServices";
import { GroundItemManager } from "../src/game/items/GroundItemManager";
import type { PlayerState } from "../src/game/player";
import { MAX_ITEM_STACK_QUANTITY } from "../src/game/trade/TradeInventoryCapacity";
import { GroundItemHandler } from "../src/network/managers/GroundItemHandler";

const tick = 100;
const tile = Object.freeze({ x: 3200, y: 3200, level: 0 });
const groundItems = new GroundItemManager({} as ServerServices);
const stack = groundItems.spawn(
    995,
    2,
    tile,
    tick,
    { ownerId: 42, privateTicks: 75, durationTicks: 150 },
    -1,
);
assert(stack);
const originalMetadata = {
    id: stack.id,
    createdTick: stack.createdTick,
    ownerId: stack.ownerId,
    privateUntilTick: stack.privateUntilTick,
    expiresTick: stack.expiresTick,
    staticSpawnKey: stack.staticSpawnKey,
    worldViewId: stack.worldViewId,
};

let inventory = Array.from({ length: 28 }, () => ({ itemId: -1, quantity: 0 }));
inventory[0] = { itemId: 995, quantity: MAX_ITEM_STACK_QUANTITY };
let insertionResult = 0;
let insertionCalls = 0;
let throwDuringInsertion = false;
const player = {
    id: 42,
    tileX: tile.x,
    tileY: tile.y,
    level: tile.level,
    worldViewId: -1,
    getInventoryEntries: () => inventory,
    queueOneShotSeq: () => undefined,
    faceTile: () => undefined,
} as unknown as PlayerState;
const services = {
    ticker: { currentTick: () => tick },
    groundItems,
    dataLoaderService: { getObjType: () => undefined },
    inventoryService: {
        addItemToInventory: () => {
            insertionCalls++;
            if (throwDuringInsertion) throw new Error("simulated inventory insertion failure");
            return { slot: insertionResult > 0 ? 0 : -1, added: insertionResult };
        },
    },
    messagingService: { queueChatMessage: () => undefined },
    mapService: undefined,
    networkLayer: { withDirectSendBypass: (_context: string, fn: () => unknown) => fn() },
    soundService: { sendSound: () => undefined },
    playerGroundSerial: new Map([[player.id, 1]]),
    playerGroundChunk: new Map<number, number>(),
} as unknown as ServerServices;
const handler = new GroundItemHandler(services);

handler.attemptTakeGroundItem(player, tile, 995, stack.id, 2);
assert.equal(
    insertionCalls,
    0,
    "a signed-int-capped inventory stack must reject pickup before removing the ground pile",
);
assert.equal(stack.quantity, 2);
assert.equal(stack.id, originalMetadata.id);

inventory = Array.from({ length: 28 }, () => ({ itemId: -1, quantity: 0 }));
insertionResult = 1;
handler.attemptTakeGroundItem(player, tile, 995, stack.id, 2);
assert.equal(insertionCalls, 1);
assert.equal(stack.quantity, 1, "a partial insertion restores the uninserted remainder");
assert.deepEqual(
    {
        id: stack.id,
        createdTick: stack.createdTick,
        ownerId: stack.ownerId,
        privateUntilTick: stack.privateUntilTick,
        expiresTick: stack.expiresTick,
        staticSpawnKey: stack.staticSpawnKey,
        worldViewId: stack.worldViewId,
    },
    originalMetadata,
    "rollback must preserve the authoritative ground-stack identity and visibility metadata",
);
assert.equal(
    groundItems.queryArea(tile.x, tile.y, tile.level, 0, tick, 99, -1).length,
    0,
    "the restored private remainder must not become visible to another player",
);

insertionResult = 0;
handler.attemptTakeGroundItem(player, tile, 995, stack.id, 1);
assert.equal(insertionCalls, 2);
assert.equal(stack.quantity, 1, "a failed insertion restores the complete removed amount");
assert.equal(
    groundItems.queryArea(tile.x, tile.y, tile.level, 0, tick, player.id, -1)[0]?.id,
    stack.id,
);

throwDuringInsertion = true;
handler.attemptTakeGroundItem(player, tile, 995, stack.id, 1);
throwDuringInsertion = false;
assert.equal(insertionCalls, 3);
assert.equal(stack.quantity, 1, "a thrown insertion restores the complete removed amount");
assert.deepEqual(
    {
        id: stack.id,
        createdTick: stack.createdTick,
        ownerId: stack.ownerId,
        privateUntilTick: stack.privateUntilTick,
        expiresTick: stack.expiresTick,
        staticSpawnKey: stack.staticSpawnKey,
        worldViewId: stack.worldViewId,
    },
    originalMetadata,
    "exception rollback retains the original stack metadata",
);

const staticStack = groundItems.registerStaticSpawn(
    { itemId: 995, quantity: 1, tile: { x: 3201, y: 3200, level: 0 }, respawnTicks: 50 },
    tick,
);
assert(staticStack);
const staticRemoval = groundItems.removeById(staticStack.id, 1, tick, player.id);
assert(staticRemoval);
assert.equal(staticRemoval.restore(), 1);
groundItems.tick(tick + 50);
assert.deepEqual(
    groundItems
        .queryArea(3201, 3200, 0, 0, tick + 50, player.id, -1)
        .map(({ id, staticSpawnKey, quantity }) => ({ id, staticSpawnKey, quantity })),
    [{ id: staticStack.id, staticSpawnKey: staticStack.staticSpawnKey, quantity: 1 }],
    "rollback must cancel a static spawn's scheduled replacement and retain its identity",
);

console.log("ground item pickup transaction tests passed");
