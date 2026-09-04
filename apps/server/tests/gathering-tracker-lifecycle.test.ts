import assert from "node:assert/strict";

import type { ServerServices } from "@server/game/ServerServices";
import { ResourceNodeTracker } from "@server/game/skilling/ResourceNodeTracker";
import { GatheringSystemManager } from "@server/game/systems/GatheringSystemManager";

const restored: string[] = [];
const spawned: number[] = [];
const services = {
    locationService: {
        emitLocChange: (oldId: number, newId: number) => restored.push(`${oldId}->${newId}`),
    },
    groundItems: { spawn: (itemId: number) => spawned.push(itemId) },
} as unknown as ServerServices;
const manager = new GatheringSystemManager(services);

const first = new ResourceNodeTracker<{ oldId: number; newId: number }>();
first.add("first", { x: 1, y: 1 }, 0, 100, { oldId: 2, newId: 1 });
const disposeFirst = manager.registerTracker("rocks", first, (node, facade) => {
    facade.emitLocChange(node.data.oldId, node.data.newId, node.tile, node.level);
});

const second = new ResourceNodeTracker<{ oldId: number; newId: number }>();
second.add("second", { x: 2, y: 2 }, 0, 100, { oldId: 4, newId: 3 });
const disposeSecond = manager.registerTracker("rocks", second, (node, facade) => {
    facade.emitLocChange(node.data.oldId, node.data.newId, node.tile, node.level);
});
assert.deepEqual(restored, ["2->1"], "replacing a tracker must restore its depleted nodes");
assert.equal(first.size, 0);
assert.equal(manager.getTracker("rocks"), second);

disposeFirst();
assert.equal(
    manager.getTracker("rocks"),
    second,
    "a stale disposer must not remove a replacement provider",
);
disposeSecond();
disposeSecond();
assert.deepEqual(restored, ["2->1", "4->3"], "owned disposal must restore each node once");
assert.equal(manager.getTracker("rocks"), undefined);

const reused = new ResourceNodeTracker<{ oldId: number; newId: number }>();
reused.add("reused", { x: 4, y: 4 }, 0, 100, { oldId: 8, newId: 7 });
const staleSameTrackerDispose = manager.registerTracker("reused", reused, (node, facade) => {
    facade.emitLocChange(node.data.oldId, node.data.newId, node.tile, node.level);
});
const currentSameTrackerDispose = manager.registerTracker("reused", reused, (node, facade) => {
    facade.emitLocChange(node.data.oldId, node.data.newId, node.tile, node.level);
});
staleSameTrackerDispose();
assert.equal(
    manager.getTracker("reused"),
    reused,
    "an old token must not dispose a re-registration of the same tracker instance",
);
currentSameTrackerDispose();
assert.equal(manager.getTracker("reused"), undefined);
assert.deepEqual(restored, ["2->1", "4->3", "8->7"]);

const expiring = new ResourceNodeTracker<{ oldId: number; newId: number }>();
expiring.add("expiring", { x: 3, y: 3 }, 0, 5, { oldId: 6, newId: 5 });
manager.registerTracker("trees", expiring, (node, facade) => {
    facade.emitLocChange(node.data.oldId, node.data.newId, node.tile, node.level);
});
manager.processTick(4);
assert.equal(expiring.size, 1);
manager.processTick(5);
assert.equal(expiring.size, 0);
assert.deepEqual(restored, ["2->1", "4->3", "8->7", "6->5"]);

const isolated = new ResourceNodeTracker<{ oldId: number; newId: number }>();
isolated.add("throws", { x: 5, y: 5 }, 0, 6, { oldId: 10, newId: 9 });
isolated.add("continues", { x: 6, y: 6 }, 0, 6, { oldId: 12, newId: 11 });
manager.registerTracker("isolated", isolated, (node, facade) => {
    if (node.key === "throws") throw new Error("test restoration failure");
    facade.emitLocChange(node.data.oldId, node.data.newId, node.tile, node.level);
});
manager.processTick(6);
assert.equal(isolated.size, 0);
assert.deepEqual(
    restored,
    ["2->1", "4->3", "8->7", "6->5", "12->11"],
    "one restoration error must not prevent later nodes from being processed",
);

const cleanupOnly = new ResourceNodeTracker<{ oldId: number; newId: number }>();
cleanupOnly.add("cleanup", { x: 7, y: 7 }, 0, 100, { oldId: 14, newId: 13 });
const disposeCleanupOnly = manager.registerTracker(
    "fire-like",
    cleanupOnly,
    (node, facade) => {
        facade.emitLocChange(node.data.oldId, node.data.newId, node.tile, node.level);
        facade.spawnGroundItem(592, 1, { ...node.tile, level: node.level }, node.expiryTick);
    },
    {
        onDispose: (node, facade) => {
            facade.emitLocChange(node.data.oldId, node.data.newId, node.tile, node.level);
        },
    },
);
disposeCleanupOnly();
assert.deepEqual(spawned, [], "provider cleanup must not run natural-expiry rewards");

const natural = new ResourceNodeTracker<{ oldId: number; newId: number }>();
natural.add("natural", { x: 8, y: 8 }, 0, 7, { oldId: 16, newId: 15 });
manager.registerTracker("natural-fire", natural, (node, facade) => {
    facade.emitLocChange(node.data.oldId, node.data.newId, node.tile, node.level);
    facade.spawnGroundItem(592, 1, { ...node.tile, level: node.level }, node.expiryTick);
});
manager.processTick(7);
assert.deepEqual(spawned, [592], "natural expiry must retain its reward callback");

console.log("gathering-tracker-lifecycle.test.ts: all assertions passed");
