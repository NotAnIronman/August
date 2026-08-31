import assert from "node:assert/strict";

import {
    DEFAULT_HALBERD_MELEE_RANGE,
    HALBERD_WEAPON_CATEGORY,
    resolvePlayerAttackReach,
} from "../src/game/combat/CombatRules";

// Bug #4: halberds fell back to melee range 1 whenever the equipped item's
// cache definition had no explicit param 13 weapon range set, making them
// behave identically to a dagger instead of reaching 2 tiles like OSRS.

// No cache param 13 present at all (the real-world failure case).
assert.equal(
    resolvePlayerAttackReach({ weaponCategory: HALBERD_WEAPON_CATEGORY, styleSlot: 0 }),
    DEFAULT_HALBERD_MELEE_RANGE,
    "halberd should reach 2 tiles even with no cache-supplied weapon range",
);

// Explicit baseRange of 0 (falsy / unset) should still fall back to 2, not 1.
assert.equal(
    resolvePlayerAttackReach(
        { weaponCategory: HALBERD_WEAPON_CATEGORY, styleSlot: 0 },
        { baseRange: 0 },
    ),
    DEFAULT_HALBERD_MELEE_RANGE,
    "a zero/unset baseRange should not collapse halberd reach to 1",
);

// If the cache (or a future data fix) does supply an explicit range greater
// than 2, that value should win rather than being clamped down.
assert.equal(
    resolvePlayerAttackReach(
        { weaponCategory: HALBERD_WEAPON_CATEGORY, styleSlot: 0 },
        { baseRange: 3 },
    ),
    3,
    "an explicit cache range greater than the halberd default should be respected",
);

// Non-halberd melee weapons must be unaffected by this change.
assert.equal(
    resolvePlayerAttackReach({ weaponCategory: 17, styleSlot: 0 }), // stab sword category
    1,
    "non-halberd melee weapons should remain range 1 by default",
);

console.log("halberd-melee-reach.test.ts: all assertions passed");
