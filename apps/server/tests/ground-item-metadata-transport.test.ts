import assert from "node:assert/strict";

import { ClientBinaryEncoder } from "@client/core/network/packet/ClientBinaryEncoder";
import { decodeServerPacket } from "@client/core/network/packet/ServerBinaryDecoder";
import { cloneGroundItemsPayload } from "@client/core/network/server-connection/domain/groundItems";
import type { GroundItemsServerPayload } from "@client/core/network/server-connection/types/messages";
import { getItemDefinition } from "@server/data/items";
import type { ServerServices } from "@server/game/ServerServices";
import { GroundItemManager } from "@server/game/items/GroundItemManager";
import type { PlayerState } from "@server/game/player";
import { GroundItemHandler } from "@server/network/managers/GroundItemHandler";
import { decodeClientPacket } from "@server/network/packet/ClientBinaryDecoder";
import { ServerBinaryEncoder } from "@server/network/packet/ServerBinaryEncoder";

const encoder = new ServerBinaryEncoder();
const exactStack = {
    id: 91,
    itemId: 7,
    quantity: 25,
    tile: { x: 3200, y: 3201, level: 2 },
    name: "Cannon base",
    value: 183_327,
    highAlch: 112_500,
    tradeable: true,
    stackable: true,
    noted: true,
    unnotedItemId: 6,
    createdTick: 10,
    privateUntilTick: 110,
    expiresTick: 310,
    ownerId: 42,
    isPrivate: true,
    ownership: 1 as const,
};

const snapshotPacket = encoder.encodeGroundItems(7, [exactStack]);
const decodedSnapshot = decodeServerPacket(snapshotPacket) as any;
assert.deepEqual(decodedSnapshot, {
    type: "ground_items",
    payload: { kind: "snapshot", serial: 7, stacks: [exactStack] },
});

const deltaPacket = encoder.encodeGroundItemsDelta(8, [{ ...exactStack, quantity: 30 }], [12]);
assert.deepEqual(decodeServerPacket(deltaPacket), {
    type: "ground_items",
    payload: {
        kind: "delta",
        serial: 8,
        upserts: [{ ...exactStack, quantity: 30 }],
        removes: [12],
    },
});

for (let length = 0; length < snapshotPacket.length; length++) {
    assert.equal(
        decodeServerPacket(snapshotPacket.slice(0, length)),
        null,
        `truncated ground-item metadata packet at byte ${length} must be rejected atomically`,
    );
}

const legacyPacket = encoder.encodeGroundItems(9, [
    {
        id: 92,
        itemId: 995,
        quantity: 10,
        tile: { x: 3200, y: 3200, level: 0 },
        ownership: 0,
    },
]);
assert.deepEqual(decodeServerPacket(legacyPacket), {
    type: "ground_items",
    payload: {
        kind: "snapshot",
        serial: 9,
        stacks: [
            {
                id: 92,
                itemId: 995,
                quantity: 10,
                tile: { x: 3200, y: 3200, level: 0 },
                createdTick: undefined,
                privateUntilTick: undefined,
                expiresTick: undefined,
                ownerId: undefined,
                isPrivate: false,
                ownership: 0,
            },
        ],
    },
});

assert.deepEqual(
    cloneGroundItemsPayload(decodedSnapshot.payload as GroundItemsServerPayload),
    decodedSnapshot.payload,
    "JSON/in-memory normalization must retain exact authoritative metadata",
);

const tile = Object.freeze({ x: 3200, y: 3200, level: 0 });
const currentTick = 100;
const sent: Uint8Array[] = [];
let groundItems: GroundItemManager;
const services = {
    ticker: { currentTick: () => currentTick },
    dataLoaderService: { getObjType: () => undefined },
    playerGroundSerial: new Map<number, number>(),
    playerGroundChunk: new Map<number, number>(),
    networkLayer: {
        sendWithGuard: (_ws: unknown, packet: Uint8Array) => sent.push(packet),
    },
} as unknown as ServerServices;
groundItems = new GroundItemManager(services);
(services as any).groundItems = groundItems;

const notedStack = groundItems.spawn(7, 25, tile, currentTick, {
    privateTicks: 0,
    durationTicks: 100,
});
const coinStack = groundItems.spawn(995, 100, tile, currentTick, {
    privateTicks: 0,
    durationTicks: 100,
});
assert(notedStack && coinStack);

const observer = {
    id: 99,
    tileX: tile.x,
    tileY: tile.y,
    level: tile.level,
    worldViewId: -1,
} as PlayerState;
const handler = new GroundItemHandler(services);
handler.maybeSendGroundItemSnapshot({ readyState: 1 } as any, observer);
assert.equal(sent.length, 1);
const populated = decodeServerPacket(sent[0]) as any;
const populatedById = new Map<number, any>(
    populated.payload.stacks.map((stack: any) => [stack.itemId, stack]),
);
const canonical = getItemDefinition(6);
assert(canonical);
assert.deepEqual(
    {
        name: populatedById.get(7)?.name,
        value: populatedById.get(7)?.value,
        highAlch: populatedById.get(7)?.highAlch,
        tradeable: populatedById.get(7)?.tradeable,
        stackable: populatedById.get(7)?.stackable,
        noted: populatedById.get(7)?.noted,
        unnotedItemId: populatedById.get(7)?.unnotedItemId,
    },
    {
        name: canonical.name,
        value: canonical.value,
        highAlch: canonical.highAlch,
        tradeable: canonical.tradeable,
        stackable: true,
        noted: true,
        unnotedItemId: canonical.id,
    },
    "noted stacks must use the canonical item definition for valuation",
);
assert.equal(populatedById.get(995)?.value, 1, "coins always have a one-coin unit value");
assert.equal(populatedById.get(995)?.highAlch, 0);

const actionPacket = new ClientBinaryEncoder().encodeGroundItemAction({
    stackId: 91,
    itemId: 7,
    quantity: 25,
    tile: { x: 3200, y: 3201, level: 2 },
    option: "Take",
    opNum: 3,
    modifierFlags: 5,
});
assert.deepEqual(decodeClientPacket(actionPacket), {
    type: "ground_item_action",
    payload: {
        stackId: 91,
        itemId: 7,
        quantity: 25,
        tile: { x: 3200, y: 3201, level: 2 },
        option: "Take",
        opNum: 3,
        modifierFlags: 5,
    },
});

console.log("ground item metadata transport tests passed");
