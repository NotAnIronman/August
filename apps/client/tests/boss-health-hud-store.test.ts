import assert from "node:assert/strict";

import {
    BossHealthHudStore,
    formatBossHealthHudPercent,
    getBossHealthHudHue,
    getNextBossHealthHudMarker,
    normalizeBossHealthHudMarkers,
} from "@client/features/boss-health/BossHealthHudStore";

const markers = normalizeBossHealthHudMarkers([
    { percent: 50, label: "Enrage", style: "danger" },
    { percent: 75, label: "Adds", style: "phase" },
    { percent: 50, label: "Duplicate is ignored" },
    { percent: 25.555, label: "  Final   stand  " },
    { percent: 0 },
    { percent: 100 },
    { percent: Number.NaN },
]);

assert.deepEqual(markers, [
    { percent: 75, label: "Adds", style: "phase" },
    { percent: 50, label: "Enrage", style: "danger" },
    { percent: 25.56, label: "Final stand", style: "mechanic" },
]);
assert.equal(getNextBossHealthHudMarker(markers, 82)?.label, "Adds");
assert.equal(getNextBossHealthHudMarker(markers, 75)?.label, "Enrage");
assert.equal(getNextBossHealthHudMarker(markers, 20), undefined);
assert.equal(getBossHealthHudHue(100), 120);
assert.equal(getBossHealthHudHue(50), 60);
assert.equal(getBossHealthHudHue(-10), 0);
assert.equal(formatBossHealthHudPercent(71.6), "72%");
assert.equal(formatBossHealthHudPercent(9.94), "9.9%");
assert.equal(formatBossHealthHudPercent(9.99), "9.9%");
assert.equal(formatBossHealthHudPercent(0.01), "0.1%");
assert.equal(formatBossHealthHudPercent(0), "0%");
assert.equal(formatBossHealthHudPercent(99.9), "99%");
assert.equal(formatBossHealthHudPercent(100), "100%");

const store = new BossHealthHudStore();
let emissions = 0;
const unsubscribe = store.subscribe(() => emissions++);

store.ingest({
    active: true,
    npcTypeId: 9001,
    name: "<col=ff0000>The   Warden</col>",
    current: 750,
    maximum: 1000,
    markers,
});

const active = store.getState();
assert.equal(active.active, true);
assert.equal(active.name, "The Warden");
assert.equal(active.current, 750);
assert.equal(active.maximum, 1000);
assert.equal(active.percent, 75);
assert.equal(active.precisePercent, 75);
assert.deepEqual(active.markers, markers);
assert.equal(emissions, 1);

// Identical updates retain the immutable snapshot and do not wake React.
store.ingest({
    active: true,
    npcTypeId: 9001,
    name: "The Warden",
    current: 750,
    maximum: 1000,
    markers,
});
assert.equal(store.getState(), active);
assert.equal(emissions, 1);

// Subsequent authoritative updates replace health while retaining configured gates.
store.ingest({
    active: true,
    npcTypeId: 9001,
    name: "The Warden",
    current: 499,
    maximum: 1000,
    markers,
});
assert.equal(store.getState().percent, 50);
assert.equal(store.getState().precisePercent, 49.9);
assert.deepEqual(store.getState().markers, markers);
assert.equal(emissions, 2);

// Explicit reset prevents stale encounter state after disconnect/logout.
store.reset();
const reset = store.getState();
assert.equal(reset.active, false);
assert.equal(reset.name, "");
assert.equal(reset.current, 0);
assert.equal(reset.maximum, 1);
assert.deepEqual(reset.markers, []);

// A remounted React subscriber can always read the latest active snapshot.
store.ingest({
    active: true,
    npcTypeId: 42,
    name: "New encounter",
    current: 1,
    maximum: 3,
    markers: [{ percent: 66.67 }, { percent: 33.33 }],
});
assert.equal(store.getState().name, "New encounter");
assert.equal(store.getState().percent, 33);
assert.ok(Math.abs(store.getState().precisePercent - 100 / 3) < 0.0001);

unsubscribe();
const emissionsBeforeUnsubscribedUpdate = emissions;
store.ingest({
    active: true,
    npcTypeId: 42,
    name: "New encounter",
    current: 0,
    maximum: 3,
    markers: [{ percent: 66.67 }, { percent: 33.33 }],
});
assert.equal(emissions, emissionsBeforeUnsubscribedUpdate);

console.log("Boss health HUD store regression test passed");
