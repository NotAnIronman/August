import assert from "node:assert/strict";

import {
    getProviderRegistry,
    resetProviderRegistry,
    type ProviderRegistryState,
} from "@server/game/providers/ProviderRegistry";

const registry = getProviderRegistry();
const providerKeys = [
    "weaponData",
    "fallbackSpecialAttack",
    "combatStyleSequence",
    "equipmentBonus",
    "spellXp",
    "specialAttackVisual",
    "instantUtilitySpecial",
    "skillConfiguration",
    "spellData",
    "runeData",
    "projectileParams",
    "ammoData",
] as const satisfies readonly (keyof ProviderRegistryState)[];

for (const key of providerKeys) {
    (registry as Record<keyof ProviderRegistryState, unknown>)[key] = { test: key };
}

resetProviderRegistry();

assert.equal(
    getProviderRegistry(),
    registry,
    "reset must preserve registry identity for consumers retaining its reference",
);
assert.deepEqual(Object.keys(registry), [], "reset must remove every registered provider");

// Reset remains safe during partially initialized startup and repeated shutdown.
registry.spellXp = { getSpellBaseXp: () => 1 };
resetProviderRegistry();
resetProviderRegistry();
assert.deepEqual(Object.keys(registry), []);

console.log("provider registry lifecycle regression test passed");
