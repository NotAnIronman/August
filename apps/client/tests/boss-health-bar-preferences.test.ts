import assert from "node:assert/strict";

import {
    BossHealthBarPreferences,
    normalizeBossHealthBarStyle,
    type BossHealthBarStyle,
} from "@client/features/boss-health/BossHealthBarPreferences";

type StoredPreferences = {
    readonly version: 1;
    readonly style: BossHealthBarStyle;
};

assert.equal(normalizeBossHealthBarStyle("modern"), "modern");
assert.equal(normalizeBossHealthBarStyle("oldschool"), "oldschool");
assert.equal(normalizeBossHealthBarStyle("unknown"), "modern");
assert.equal(normalizeBossHealthBarStyle(undefined), "modern");

let saved: StoredPreferences | undefined;
const preferences = new BossHealthBarPreferences({
    load: () => ({ version: 1, style: "oldschool" }),
    save: (value) => {
        saved = value;
    },
});

assert.equal(preferences.getSnapshot(), "oldschool");

let emissions = 0;
const unsubscribe = preferences.subscribe(() => emissions++);

preferences.setStyle("modern");
assert.equal(preferences.getSnapshot(), "modern");
assert.deepEqual(saved, { version: 1, style: "modern" });
assert.equal(emissions, 1);

// Selecting the active segment is a no-op and does not rewrite local storage.
saved = undefined;
preferences.setStyle("modern");
assert.equal(saved, undefined);
assert.equal(emissions, 1);

preferences.setStyle("oldschool");
assert.equal(preferences.getSnapshot(), "oldschool");
assert.deepEqual(saved, { version: 1, style: "oldschool" });
assert.equal(emissions, 2);

unsubscribe();
preferences.setStyle("modern");
assert.equal(emissions, 2);

const defaultsInvalidPersistedValues = new BossHealthBarPreferences({
    load: () => ({ version: 1, style: "future-style" as BossHealthBarStyle }),
    save: () => undefined,
});
assert.equal(defaultsInvalidPersistedValues.getSnapshot(), "modern");

console.log("Boss health bar preferences regression test passed");
