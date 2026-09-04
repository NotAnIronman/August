import assert from "node:assert/strict";

import { decodeServerPacket } from "@client/core/network/packet/ServerBinaryDecoder";
import type { ServerServices } from "@server/game/ServerServices";
import { GroundItemManager } from "@server/game/items/GroundItemManager";
import type { PlayerState } from "@server/game/player";
import { GroundItemHandler } from "@server/network/managers/GroundItemHandler";

let tick = 100;
const tile = Object.freeze({ x: 3200, y: 3200, level: 0 });
const sent: Uint8Array[] = [];
const services = {
    ticker: { currentTick: () => tick },
    dataLoaderService: { getObjType: () => undefined },
    playerGroundSerial: new Map<number, number>(),
    playerGroundChunk: new Map<number, number>(),
    networkLayer: {
        sendWithGuard: (_ws: unknown, packet: Uint8Array) => sent.push(packet),
    },
} as unknown as ServerServices;
const manager = new GroundItemManager(services);
(services as any).groundItems = manager;

const tradeable = manager.spawn(6, 1, tile, tick, {
    ownerId: 42,
    privateTicks: 2,
    durationTicks: 10,
});
assert(tradeable);
const ownerId = tradeable.ownerId;
const createdTick = tradeable.createdTick;
const expiresTick = tradeable.expiresTick;

const observer = {
    id: 99,
    tileX: tile.x,
    tileY: tile.y,
    level: tile.level,
    worldViewId: -1,
} as PlayerState;
const handler = new GroundItemHandler(services);
const socket = { readyState: 1 } as any;
handler.maybeSendGroundItemSnapshot(socket, observer);
assert.deepEqual((decodeServerPacket(sent[0]) as any).payload.stacks, []);

const beforeTransitionSerial = manager.getSerial();
tick = 101;
manager.tick(tick);
handler.maybeSendGroundItemSnapshot(socket, observer);
assert.equal(manager.getSerial(), beforeTransitionSerial);
assert.equal(sent.length, 1, "an unchanged private stack must not emit redundant updates");

tick = 102;
manager.tick(tick);
assert.equal(manager.getSerial(), beforeTransitionSerial + 1);
handler.maybeSendGroundItemSnapshot(socket, observer);
assert.equal(sent.length, 2);
const publicDelta = decodeServerPacket(sent[1]) as any;
assert.equal(publicDelta.payload.kind, "delta");
assert.equal(publicDelta.payload.upserts.length, 1);
assert.deepEqual(
    {
        ownerId: publicDelta.payload.upserts[0].ownerId,
        ownership: publicDelta.payload.upserts[0].ownership,
        privateUntilTick: publicDelta.payload.upserts[0].privateUntilTick,
        isPrivate: publicDelta.payload.upserts[0].isPrivate,
        createdTick: publicDelta.payload.upserts[0].createdTick,
        expiresTick: publicDelta.payload.upserts[0].expiresTick,
    },
    {
        ownerId,
        ownership: 2,
        privateUntilTick: undefined,
        isPrivate: false,
        createdTick,
        expiresTick,
    },
    "the public transition must retain ownership and lifetime history",
);
assert.equal(manager.queryArea(tile.x, tile.y, 0, 0, tick, observer.id, -1).length, 1);

const transitionedSerial = manager.getSerial();
tick = 103;
manager.tick(tick);
assert.equal(
    manager.getSerial(),
    transitionedSerial,
    "the completed private-to-public transition must not bump serial every tick",
);

const untradeable = manager.spawn(1, 1, { x: 3201, y: 3200, level: 0 }, tick, {
    ownerId: 42,
    durationTicks: 10,
});
assert(untradeable);
assert.equal(untradeable.privateUntilTick, tick + 10);
assert.equal(
    manager.queryArea(3201, 3200, 0, 0, tick + 9, observer.id, -1).length,
    0,
    "untradeable owner drops remain private for their full default lifetime",
);
manager.tick(tick + 10);
assert.equal(
    manager.queryArea(3201, 3200, 0, 0, tick + 10, observer.id, -1).length,
    0,
    "untradeable owner drops expire without a public window",
);

tick = 200;
const overridden = manager.spawn(1, 1, { x: 3202, y: 3200, level: 0 }, tick, {
    ownerId: 42,
    privateTicks: 2,
    durationTicks: 10,
});
assert(overridden);
manager.tick(tick + 2);
assert.equal(
    manager.queryArea(3202, 3200, 0, 0, tick + 2, observer.id, -1).length,
    1,
    "an explicit privateTicks override still permits intentional custom visibility",
);

tick = 300;
// Clear the finite-lifetime fixtures above so the serial assertion below
// observes only the permanent stack's lifecycle.
manager.tick(tick);
const permanentUntradeable = manager.spawn(
    1,
    1,
    { x: 3203, y: 3200, level: 0 },
    tick,
    {
        ownerId: 42,
        durationTicks: 0,
    },
);
assert(permanentUntradeable);
assert.equal(permanentUntradeable.privateForever, true);
assert.equal(permanentUntradeable.privateUntilTick, undefined);
assert.equal(permanentUntradeable.expiresTick, undefined);
assert.equal(
    manager.queryArea(3203, 3200, 0, 0, tick + 10_000, observer.id, -1).length,
    0,
    "a permanent untradeable owner drop must never become visible to another player",
);
assert.equal(
    manager.queryArea(3203, 3200, 0, 0, tick + 10_000, 42, -1).length,
    1,
    "the owner must retain access to a permanent untradeable drop",
);
const permanentSerial = manager.getSerial();
manager.tick(tick + 10_000);
assert.equal(
    manager.getSerial(),
    permanentSerial,
    "a permanent-private drop must not repeatedly dirty the ground-item serial",
);

tick = 400;
const finiteFirst = manager.spawn(14, 1, { x: 3204, y: 3200, level: 0 }, tick, {
    ownerId: 42,
    durationTicks: 10,
});
const permanentSecond = manager.spawn(14, 1, { x: 3204, y: 3200, level: 0 }, tick, {
    ownerId: 42,
    durationTicks: 0,
});
assert(finiteFirst && permanentSecond);
assert.equal(permanentSecond.id, finiteFirst.id);
assert.equal(permanentSecond.quantity, 2);
assert.equal(permanentSecond.privateForever, true);
assert.equal(permanentSecond.expiresTick, undefined);
manager.tick(tick + 100);
assert.equal(manager.queryArea(3204, 3200, 0, 0, tick + 100, 42, -1).length, 1);
assert.equal(manager.queryArea(3204, 3200, 0, 0, tick + 100, observer.id, -1).length, 0);

tick = 600;
const permanentFirst = manager.spawn(14, 1, { x: 3205, y: 3200, level: 0 }, tick, {
    ownerId: 42,
    durationTicks: 0,
});
const finiteSecond = manager.spawn(14, 1, { x: 3205, y: 3200, level: 0 }, tick, {
    ownerId: 42,
    durationTicks: 10,
});
assert(permanentFirst && finiteSecond);
assert.equal(finiteSecond.id, permanentFirst.id);
assert.equal(finiteSecond.quantity, 2);
assert.equal(finiteSecond.privateForever, true);
assert.equal(
    finiteSecond.expiresTick,
    undefined,
    "a permanent stack remains non-expiring when a finite quantity merges into it",
);
manager.tick(tick + 100);
assert.equal(manager.queryArea(3205, 3200, 0, 0, tick + 100, 42, -1).length, 1);
assert.equal(manager.queryArea(3205, 3200, 0, 0, tick + 100, observer.id, -1).length, 0);

tick = 800;
const wildernessPublic = manager.spawn(1, 1, { x: 3206, y: 3200, level: 0 }, tick, {
    ownerId: 42,
    durationTicks: 0,
    isWilderness: true,
    isConsumable: false,
});
assert(wildernessPublic);
assert.equal(wildernessPublic.privateForever, undefined);
assert.equal(wildernessPublic.privateUntilTick, undefined);
assert.equal(
    manager.queryArea(3206, 3200, 0, 0, tick, observer.id, -1).length,
    1,
    "the immediate-public wilderness policy overrides permanent untradeable privacy",
);

console.log("ground item visibility transition tests passed");
