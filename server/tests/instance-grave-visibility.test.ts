import assert from "node:assert/strict";

import { reclaimInstanceGrave } from "../extrascripts/bandos-instance/index";
import type { ServerServices } from "../src/game/ServerServices";
import {
    INSTANCE_GRAVE_RECLAIM_LOC_ID,
    INSTANCE_GRAVE_RECLAIM_TILE,
    isAuthorizedInstanceGraveInteraction,
    syncInstanceGravePresentation,
} from "../src/game/death/InstanceGravePresentation";
import type { PlayerState } from "../src/game/player";
import type { LocInteractionEvent, ScriptServices } from "../src/game/scripts/types";
import { LocationService } from "../src/game/services/LocationService";
import { PlayerInstanceGraveState } from "../src/game/state/PlayerInstanceGraveState";
import { PlayerInventoryState } from "../src/game/state/PlayerInventoryState";
import { resolveGroundItemPickupQuantity } from "../src/network/managers/GroundItemHandler";

const replacements: unknown[][] = [];
const clears: unknown[][] = [];
const location = {
    replaceTemporaryLoc: (...args: unknown[]) => {
        replacements.push(args);
        return {};
    },
    clearTemporaryLoc: (...args: unknown[]) => {
        clears.push(args);
        return true;
    },
} as unknown as Pick<LocationService, "replaceTemporaryLoc" | "clearTemporaryLoc">;
const player = {
    id: 42,
    worldViewId: -1,
    instanceGrave: new PlayerInstanceGraveState(),
} as PlayerState;

syncInstanceGravePresentation(location, player);
assert.equal(replacements.length, 0, "an empty grave must not be rendered");
assert.deepEqual(clears.at(-1), [
    { worldViewId: -1, ownerPlayerId: 42 },
    0,
    INSTANCE_GRAVE_RECLAIM_TILE,
    INSTANCE_GRAVE_RECLAIM_TILE.level,
    10,
]);

player.instanceGrave.store([{ itemId: 532, quantity: 3 }], 50_000);
player.instanceGrave.deposit([
    { itemId: 532, quantity: 2 },
    { itemId: 995, quantity: 100 },
]);
assert.equal(player.instanceGrave.getReclaimCost(), 50_000);
assert.deepEqual(player.instanceGrave.serialize()?.items, [
    { itemId: 532, quantity: 5 },
    { itemId: 995, quantity: 100 },
]);
syncInstanceGravePresentation(location, player);
assert.deepEqual(replacements.at(-1), [
    { worldViewId: -1, ownerPlayerId: 42 },
    0,
    INSTANCE_GRAVE_RECLAIM_LOC_ID,
    INSTANCE_GRAVE_RECLAIM_TILE,
    INSTANCE_GRAVE_RECLAIM_TILE.level,
    { newShape: 10, newRotation: 0 },
]);

const reclaimed = player.instanceGrave.reclaim((_itemId, quantity) => quantity);
assert.equal(reclaimed.reclaimCost, 50_000, "the completed reclaim reports its configured fee");
player.instanceGrave.deposit([{ itemId: 526, quantity: 1 }]);
assert.equal(
    player.instanceGrave.serialize()?.reclaimCost,
    undefined,
    "a later grave does not inherit the completed grave's fee",
);
player.instanceGrave.store([{ itemId: 526, quantity: 2 }], 1_000);
player.instanceGrave.markReclaimCostPaid();
player.instanceGrave.reclaim((_itemId, quantity) => quantity - 1);
assert.equal(
    player.instanceGrave.getReclaimCost(),
    0,
    "a paid partial reclaim cannot charge the same fee again",
);
player.instanceGrave.reclaim((_itemId, quantity) => quantity);

const overflowGrave = new PlayerInstanceGraveState();
const stackCountGrave = new PlayerInstanceGraveState();
stackCountGrave.store([{ itemId: 995, quantity: 63_878 }]);
assert.equal(
    stackCountGrave.reclaim((_itemId, quantity) => quantity).reclaimed,
    1,
    "a coin stack is reclaimed and reported as one stored grave entry",
);
overflowGrave.store([{ itemId: 995, quantity: 2_147_483_647 }]);
overflowGrave.deposit([{ itemId: 995, quantity: 2 }]);
assert.deepEqual(
    overflowGrave.serialize()?.items,
    [
        { itemId: 995, quantity: 2_147_483_647 },
        { itemId: 995, quantity: 2 },
    ],
    "a repeated death preserves quantities above one signed-int stack as extra chunks",
);
syncInstanceGravePresentation(location, player);
assert.equal(clears.length, 2, "the owner-only loc is removed after the final reclaim");

assert.equal(
    resolveGroundItemPickupQuantity({
        requested: 10,
        available: 10,
        inventoryCapacity: 28,
        stackable: false,
    }),
    1,
    "a visual pile of non-stackable items still picks up one physical item",
);
assert.equal(
    resolveGroundItemPickupQuantity({
        requested: 10,
        available: 10,
        inventoryCapacity: 28,
        stackable: true,
    }),
    10,
    "native stackable items retain take-all behavior",
);

const authoritativeLocation = new LocationService({
    ticker: { currentTick: () => 100 },
} as unknown as ServerServices);
let insertedFromGrave = 0;
let inventorySnapshots = 0;
const graveInventoryEntries = Array.from({ length: 28 }, () => ({ itemId: -1, quantity: 0 }));
const gravePlayer = {
    id: 77,
    worldViewId: -1,
    instanceGrave: new PlayerInstanceGraveState(),
    items: {
        getInventoryEntries: () => graveInventoryEntries,
        setInventorySlot: (slot: number, itemId: number, quantity: number) => {
            graveInventoryEntries[slot] = { itemId, quantity };
        },
        addItem: (itemId: number, quantity: number) => {
            insertedFromGrave += quantity;
            return {
                requested: quantity,
                completed: quantity,
                slots: [{ slot: 0, itemId, quantity }],
            };
        },
    },
} as unknown as PlayerState;
gravePlayer.instanceGrave.store([{ itemId: 532, quantity: 3 }]);
syncInstanceGravePresentation(authoritativeLocation, gravePlayer);

const exactGraveTarget = {
    locId: INSTANCE_GRAVE_RECLAIM_LOC_ID,
    tile: INSTANCE_GRAVE_RECLAIM_TILE,
    level: INSTANCE_GRAVE_RECLAIM_TILE.level,
};
assert.equal(
    isAuthorizedInstanceGraveInteraction(authoritativeLocation, gravePlayer, exactGraveTarget),
    true,
    "the owner can interact with their authoritative visible grave",
);
assert.equal(
    isAuthorizedInstanceGraveInteraction(
        authoritativeLocation,
        { id: 78, worldViewId: -1 } as PlayerState,
        exactGraveTarget,
    ),
    false,
    "another player cannot authenticate against an owner-scoped grave",
);

const gameMessages: string[] = [];
const reclaimServices = {
    location: authoritativeLocation,
    inventory: { snapshotInventoryImmediate: () => inventorySnapshots++ },
    messaging: { sendGameMessage: (_player: PlayerState, message: string) => gameMessages.push(message) },
} as unknown as ScriptServices;
reclaimInstanceGrave({
    tick: 100,
    player: gravePlayer,
    services: reclaimServices,
    locId: INSTANCE_GRAVE_RECLAIM_LOC_ID,
    tile: { x: 3200, y: 3200 },
    level: 0,
    action: "read",
} as LocInteractionEvent);
assert.equal(insertedFromGrave, 0, "a forged nearby loc packet cannot remotely reclaim items");
assert.equal(gravePlayer.instanceGrave.hasItems(), true);
assert.match(gameMessages.at(-1) ?? "", /return to your gravestone/i);

reclaimInstanceGrave({
    tick: 101,
    player: gravePlayer,
    services: reclaimServices,
    ...exactGraveTarget,
    action: "read",
} as LocInteractionEvent);
assert.equal(insertedFromGrave, 3);
assert.equal(inventorySnapshots, 1);
assert.equal(gravePlayer.instanceGrave.hasItems(), false);
assert.equal(
    authoritativeLocation.hasTemporaryLocVisibleToPlayer(
        gravePlayer,
        INSTANCE_GRAVE_RECLAIM_LOC_ID,
        INSTANCE_GRAVE_RECLAIM_TILE,
        INSTANCE_GRAVE_RECLAIM_TILE.level,
    ),
    false,
    "the authoritative owner-scoped loc is removed after the final reclaim",
);

// A future paid reclaim remains all-or-nothing even if a later stack throws
// after earlier grave stacks and the coin payment have already mutated inventory.
const transactionalLocation = new LocationService({
    ticker: { currentTick: () => 200 },
} as unknown as ServerServices);
const transactionalItems = new PlayerInventoryState();
transactionalItems.setItemDefResolver((itemId) => ({ stackable: itemId === 995 }));
transactionalItems.setInventorySlot(0, 995, 5_000);
const originalAddItem = transactionalItems.addItem.bind(transactionalItems);
let graveInsertionCalls = 0;
transactionalItems.addItem = (itemId, quantity, options) => {
    if (itemId !== 995 && ++graveInsertionCalls === 2) {
        throw new Error("simulated second-stack insertion failure");
    }
    return originalAddItem(itemId, quantity, options);
};
const transactionalPlayer = {
    id: 88,
    worldViewId: -1,
    instanceGrave: new PlayerInstanceGraveState(),
    items: transactionalItems,
} as unknown as PlayerState;
const transactionalGraveItems = [
    { itemId: 526, quantity: 1 },
    { itemId: 532, quantity: 1 },
];
transactionalPlayer.instanceGrave.store(transactionalGraveItems, 1_000);
syncInstanceGravePresentation(transactionalLocation, transactionalPlayer);
const transactionalMessages: string[] = [];
let transactionalSnapshots = 0;
const transactionalServices = {
    location: transactionalLocation,
    inventory: { snapshotInventoryImmediate: () => transactionalSnapshots++ },
    messaging: {
        sendGameMessage: (_player: PlayerState, message: string) =>
            transactionalMessages.push(message),
    },
} as unknown as ScriptServices;
reclaimInstanceGrave({
    tick: 200,
    player: transactionalPlayer,
    services: transactionalServices,
    ...exactGraveTarget,
    action: "read",
} as LocInteractionEvent);
assert.equal(transactionalItems.getItemCount(995), 5_000, "the reclaim fee is rolled back");
assert.equal(transactionalItems.getItemCount(526), 0, "an earlier insertion is rolled back");
assert.equal(transactionalItems.getItemCount(532), 0, "the throwing stack is not inserted");
assert.deepEqual(
    transactionalPlayer.instanceGrave.serialize(),
    { items: transactionalGraveItems, reclaimCost: 1_000 },
    "the exact grave storage and fee remain available for retry",
);
assert.equal(transactionalSnapshots, 1);
assert.match(transactionalMessages.at(-1) ?? "", /no items or coins were lost/i);
assert.equal(
    transactionalLocation.hasTemporaryLocVisibleToPlayer(
        transactionalPlayer,
        INSTANCE_GRAVE_RECLAIM_LOC_ID,
        INSTANCE_GRAVE_RECLAIM_TILE,
        INSTANCE_GRAVE_RECLAIM_TILE.level,
    ),
    true,
    "the grave stays visible after a rolled-back reclaim",
);

transactionalItems.addItem = originalAddItem;
reclaimInstanceGrave({
    tick: 201,
    player: transactionalPlayer,
    services: transactionalServices,
    ...exactGraveTarget,
    action: "read",
} as LocInteractionEvent);
assert.equal(transactionalItems.getItemCount(995), 4_000);
assert.equal(transactionalItems.getItemCount(526), 1);
assert.equal(transactionalItems.getItemCount(532), 1);
assert.equal(transactionalPlayer.instanceGrave.hasItems(), false);

console.log("instance-grave-visibility.test.ts: all assertions passed");
