import assert from "node:assert/strict";
import { STARTER_LOADOUT, grantStarterLoadout } from "@server/content/gamemodes/vanilla/data/starterLoadout";
import { PlayerState } from "@server/game/player";
import { mergePlayerPersistentVars } from "@server/game/state/PlayerPersistence";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { createTestGamemode } from "./fixtures/createTestGamemode";

registerSkillConfiguration({ computeCombatLevel: () => 3, skillRestoreIntervalTicks: 100,
    skillBoostDecayIntervalTicks: 100, hitpointRegenIntervalTicks: 100,
    hitpointOverhealDecayIntervalTicks: 100, preserveDecayMultiplier: 1.5 });
const mode = createTestGamemode("starter", "Starter");
const make = () => {
    const p = new PlayerState(1, 3200, 3200, 0, mode);
    p.items.setItemDefResolver(id => ({ stackable: [882, 555, 556, 557, 558, 559, 995].includes(id) }));
    return p;
};
const player = make();
player.items.addItem(1351, 1);
player.items.addItem(772, 1); // preserve leagues-specific starting gear
grantStarterLoadout(player);
assert.equal(player.items.getInventoryEntries().filter(e => e.itemId === 772).length, 1);
for (const [id, quantity] of STARTER_LOADOUT) {
    assert.equal(player.items.getInventoryEntries().filter(e => e.itemId === id).reduce((n,e) => n + e.quantity, 0), quantity);
}
const snapshot = mergePlayerPersistentVars(undefined, JSON.parse(JSON.stringify(player.exportPersistentVars())));
const restored = make(); restored.applyPersistentVars(snapshot);
assert.equal(restored.account.starterLoadoutGranted, true);
const before = JSON.stringify(restored.items.getInventoryEntries());
grantStarterLoadout(restored);
assert.equal(JSON.stringify(restored.items.getInventoryEntries()), before, "reconnect/repeated design cannot duplicate supplies");
const full = make();
for (let slot = 0; slot < 27; slot++) full.items.setInventorySlot(slot, 315, 1);
const fullBefore = JSON.stringify(full.items.getInventoryEntries());
assert.throws(() => grantStarterLoadout(full));
assert.equal(full.account.starterLoadoutGranted, false);
assert.equal(JSON.stringify(full.items.getInventoryEntries()), fullBefore, "partial grant rolls back without losing existing items");
console.log("Starter items, persistent one-time grant and insertion rollback passed");
