import assert from "node:assert/strict";

import type { PlayerPersistentVars } from "@server/game/player";
import { mergePlayerPersistentVars } from "@server/game/state/PlayerPersistence";

// This compile-time checklist prevents a newly persisted field from quietly
// bypassing merge/sanitization the way the three regression fields below did.
const persistentFieldCoverage = {
    preferredDisplayMode: true,
    varps: true,
    varbits: true,
    gamemodeData: true,
    accountStage: true,
    accountCreationTimeMs: true,
    preferredMode: true,
    appearance: true,
    bank: true,
    bankCapacity: true,
    bankQuantityCustom: true,
    bankQuantityMode: true,
    bankWithdrawNotes: true,
    bankInsertMode: true,
    bankPlaceholders: true,
    bankCurrentTab: true,
    bankTabDisplayMode: true,
    inventory: true,
    equipment: true,
    skills: true,
    hitpoints: true,
    location: true,
    runEnergy: true,
    runToggle: true,
    autoRetaliate: true,
    combatStyleSlot: true,
    combatStyleCategory: true,
    combatSpellId: true,
    autocastEnabled: true,
    autocastMode: true,
    specialEnergy: true,
    specialActivated: true,
    quickPrayers: true,
    equipmentCharges: true,
    degradationCharges: true,
    collectionLog: true,
    follower: true,
    pendingPetRewards: true,
    instanceGrave: true,
    playTimeSeconds: true,
} as const satisfies Record<keyof PlayerPersistentVars, true>;

assert.ok(Object.keys(persistentFieldCoverage).length > 0);

const valid = mergePlayerPersistentVars(undefined, {
    pendingPetRewards: [{ itemId: 29836, quantity: 1 }],
    bankQuantityCustom: 250,
    quickPrayers: ["piety", "protect_from_magic"],
    instanceGrave: {
        items: [{ itemId: 532, quantity: 3 }],
        reclaimCost: 50_000,
        location: { locId: 42840, tile: { x: 2855, y: 5227 }, level: 0 },
    },
});

assert.equal(valid?.bankQuantityCustom, 250, "custom bank quantity must survive persistence");
assert.deepEqual(valid?.pendingPetRewards, [{ itemId: 29836, quantity: 1 }]);
assert.deepEqual(mergePlayerPersistentVars(undefined, {
    pendingPetRewards: [{ itemId: -1, quantity: 1 }, { itemId: 29836, quantity: NaN }],
})?.pendingPetRewards, []);
assert.deepEqual(valid?.quickPrayers, ["piety", "protect_from_magic"]);
assert.deepEqual(valid?.instanceGrave, {
    items: [{ itemId: 532, quantity: 3 }],
    reclaimCost: 50_000,
    location: { locId: 42840, tile: { x: 2855, y: 5227 }, level: 0 },
});

const malformed = mergePlayerPersistentVars(
    {
        varps: { 1: 10 },
        gamemodeData: { retained: true, overridden: false },
    },
    {
        varps: { 2: 20, "3junk": 30, 4: Number.NaN },
        varbits: { 5: -1, 6: 7 },
        gamemodeData: { overridden: true },
        bankCapacity: 999_999,
        bankQuantityCustom: Number.POSITIVE_INFINITY,
        bankPlaceholders: "yes",
        appearance: {
            gender: 1,
            kits: [10, Number.NaN, 12],
            colors: [3, Number.POSITIVE_INFINITY, 5],
        },
        inventory: [
            { slot: 4, itemId: 100, quantity: 1 },
            { slot: 4, itemId: 101, quantity: 2 },
            { slot: 4.5, itemId: 102, quantity: 1 },
            { slot: 28, itemId: 103, quantity: 1 },
            { slot: 5, itemId: 104, quantity: Number.NaN },
        ],
        bank: [
            { slot: 3, itemId: 200, quantity: 1, tab: 99 },
            { slot: 3, itemId: 201, quantity: 2, tab: 1 },
            { slot: -1, itemId: 202, quantity: 1 },
            { slot: 4, itemId: 203, quantity: 0, placeholder: true },
        ],
        location: { x: Number.NaN, y: 3200, level: 0 },
        runToggle: "true",
        autoRetaliate: 1,
        quickPrayers: ["piety", "not_a_prayer", "piety"],
        equipmentCharges: [
            { itemId: 300, charges: 2 },
            { itemId: 300, charges: 5 },
            { itemId: 301, charges: Number.NaN },
        ],
        degradationCharges: [
            { slot: 3, itemId: 400, charges: 2 },
            { slot: 3, itemId: 401, charges: 7 },
            { slot: 99, itemId: 402, charges: 1 },
        ],
        collectionLog: {
            items: [
                { itemId: 500, quantity: 1 },
                { itemId: 500, quantity: 4 },
                { itemId: 501, quantity: Number.NaN },
            ],
            categoryStats: [
                { structId: 600, count1: 2 },
                { structId: 601, count1: Number.NaN },
            ],
        },
        instanceGrave: {
            items: [
                { itemId: 700, quantity: 3 },
                { itemId: -1, quantity: 2 },
            ],
            location: {
                locId: 1,
                tile: { x: Number.POSITIVE_INFINITY, y: 1 },
                level: 0,
            },
        },
    } as unknown as PlayerPersistentVars,
);

assert.deepEqual(malformed?.varps, { 1: 10, 2: 20 });
assert.deepEqual(malformed?.varbits, { 5: 0, 6: 7 });
assert.deepEqual(malformed?.gamemodeData, { retained: true, overridden: true });
assert.equal(malformed?.bankCapacity, 2000);
assert.equal(malformed?.bankQuantityCustom, undefined);
assert.equal(malformed?.bankPlaceholders, undefined);
assert.deepEqual(malformed?.appearance, {
    gender: 1,
    kits: [10, -1, 12],
    colors: [3, 0, 5],
});
assert.deepEqual(malformed?.inventory, [{ slot: 4, itemId: 101, quantity: 2 }]);
assert.deepEqual(malformed?.bank, [
    { slot: 3, itemId: 201, quantity: 2, placeholder: false, filler: false, tab: 1 },
    { slot: 4, itemId: 203, quantity: 0, placeholder: true, filler: false, tab: 0 },
]);
assert.equal(malformed?.location, undefined);
assert.equal(malformed?.runToggle, undefined);
assert.equal(malformed?.autoRetaliate, undefined);
assert.deepEqual(malformed?.quickPrayers, ["piety"]);
assert.deepEqual(malformed?.equipmentCharges, [{ itemId: 300, charges: 5 }]);
assert.deepEqual(malformed?.degradationCharges, [{ slot: 3, itemId: 401, charges: 7 }]);
assert.deepEqual(malformed?.collectionLog, {
    items: [{ itemId: 500, quantity: 4 }],
    categoryStats: [{ structId: 600, count1: 2 }],
});
assert.deepEqual(malformed?.instanceGrave, { items: [{ itemId: 700, quantity: 3 }] });

console.log("player persistence sanitization regression test passed");
