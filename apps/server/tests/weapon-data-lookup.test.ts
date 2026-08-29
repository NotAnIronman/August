/**
 * Compatibility coverage for indexed lookup precedence. This deliberately does
 * not certify the curated IDs: duplicate/name-mismatched rows require a separate
 * reviewed data migration against items.json.
 */
import assert from "node:assert/strict";

import {
    getWeaponData,
    weaponDataEntries,
    weaponDataMap,
} from "@server/content/gamemodes/vanilla/data/weapons";

const firstEntryByItemId = new Map<number, (typeof weaponDataEntries)[number]>();
const lastEntryByItemId = new Map<number, (typeof weaponDataEntries)[number]>();
for (const entry of weaponDataEntries) {
    if (!firstEntryByItemId.has(entry.itemId)) firstEntryByItemId.set(entry.itemId, entry);
    lastEntryByItemId.set(entry.itemId, entry);
}

assert.equal(weaponDataMap.size, lastEntryByItemId.size);
for (const [itemId, expected] of firstEntryByItemId) {
    assert.strictEqual(
        getWeaponData(itemId),
        expected,
        `indexed lookup changed first-match precedence for item ${itemId}`,
    );
}
for (const [itemId, expected] of lastEntryByItemId) {
    assert.strictEqual(
        weaponDataMap.get(itemId),
        expected,
        `provider map changed last-match precedence for item ${itemId}`,
    );
}

console.log("weapon data lookup precedence test passed");
