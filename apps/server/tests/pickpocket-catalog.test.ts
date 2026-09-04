import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { COIN_POUCH_VALUES, PICKPOCKET_NPCS, npcIdToPickpocketDef } from "@server/content/gamemodes/vanilla/skills/thieving/pickpocketDefinitions";
import { auditPickpocketNpcs, renderPickpocketReport } from "../../../tools/diagnostics/audit-pickpocket-npcs";
import { repositoryPath } from "../../../tools/lib/repository-paths";

const snapshot = JSON.parse(readFileSync(repositoryPath("data/generated/cache/npcs.json"), "utf8"));
const audit = auditPickpocketNpcs(snapshot, PICKPOCKET_NPCS);
assert.equal(audit.summary.directPickpocketIds, 474);
assert.equal(audit.summary.assignedIds, 475, "includes null-name direct-action parent 1955; other morphs resolve dynamically");
assert.equal(audit.summary.morphCoverage, "unverified", "snapshot cannot prove that no morph parents exist");
assert.deepEqual(audit.missing, []);
assert.deepEqual(audit.invalidIds, []);
assert.deepEqual(audit.duplicateAssignments, []);
assert.deepEqual(audit.invalidDefinitions, []);
for (const def of PICKPOCKET_NPCS) {
    assert.ok(def.lootEvidence?.source && def.chanceEvidence?.source && def.requirementEvidence?.source && def.failureEvidence?.source);
    if (def.disabledReason) assert.ok(def.disabledReason.length > 20);
}

// Regressions: same menu verb/name does not imply ordinary repeatable rewards.
assert.ok(npcIdToPickpocketDef.get(12929)?.disabledReason, "quest Citizen must not inherit ordinary Citizen behavior");
assert.equal(npcIdToPickpocketDef.get(13164)?.disabledReason, undefined);
assert.ok(npcIdToPickpocketDef.get(3634)?.disabledReason, "Student is not Digsite workman");
assert.ok(npcIdToPickpocketDef.get(11093)?.disabledReason, "Head Guard is not proven to use the Guard table");
assert.notEqual(npcIdToPickpocketDef.get(5297), npcIdToPickpocketDef.get(9054), "Lletya and Prifddinas elves have distinct loot/access conditions");
assert.equal(npcIdToPickpocketDef.get(3292), npcIdToPickpocketDef.get(3260), "Warrior family includes its independently verified aliases");

// Previously shifted pouch IDs silently awarded another family's pouch/currency.
const expectedPouches = [[2540, 22523], [3292, 22524], [526, 22525], [2268, 22526], [397, 22527],
    [3937, 22528], [736, 22529], [690, 22530], [3297, 22531], [734, 22532], [5420, 22533],
    [3550, 22534], [3293, 22535], [5130, 22536], [3295, 22537]];
for (const [npc, pouch] of expectedPouches) assert.equal(npcIdToPickpocketDef.get(npc)?.coinPouchId, pouch);
assert.deepEqual(COIN_POUCH_VALUES[22536], [300, 300]);
assert.equal(npcIdToPickpocketDef.get(7682)?.coinPouchId, undefined);
assert.deepEqual(npcIdToPickpocketDef.get(7682)?.successDamage, { amount: 4, preventedByEquippedItemIds: [1580] });
assert.equal(npcIdToPickpocketDef.get(7682)?.stunTicks, 10);
for (const [id, rewards] of [[5420, [995, 2309]], [3293, [995, 562]]] as const) {
    assert.deepEqual(npcIdToPickpocketDef.get(id)?.guaranteedLoot?.map(r => r.itemId), rewards);
    assert.deepEqual(npcIdToPickpocketDef.get(id)?.lootTable, []);
}
assert.equal(npcIdToPickpocketDef.get(2540)?.reqLevel, 15);
assert.equal(npcIdToPickpocketDef.get(2541)?.xp, 22.2);
assert.equal(npcIdToPickpocketDef.get(5130)?.xp, 133.3);
assert.equal(npcIdToPickpocketDef.get(3293)?.xp, 131.8);
assert.equal(npcIdToPickpocketDef.get(3295)?.xp, 163.3);
assert.equal(npcIdToPickpocketDef.get(3295)?.maxDamage, 3);
assert.equal(npcIdToPickpocketDef.get(2540)?.lootTable.reduce((s, x) => s + x.weight, 0), 100);
assert.equal(npcIdToPickpocketDef.get(5730)?.lootTable.length, 45);
for (const itemId of [21490, 22873, 22879]) assert.ok(npcIdToPickpocketDef.get(5730)?.lootTable.some(x => x.itemId === itemId));
assert.ok(!npcIdToPickpocketDef.get(526)?.lootTable.some(x => x.itemId === 2357));
for (const itemId of [10981, 1939]) assert.ok(npcIdToPickpocketDef.get(2268)?.lootTable.some(x => x.itemId === itemId));
assert.deepEqual(npcIdToPickpocketDef.get(2268)?.lootTable.slice(0, 6).map(x => x.itemId).sort((a,b) => a-b), [10960,10961,10962,10963,10964,10965], "cave goblin food IDs must not award grubs, mushrooms or loach");

// Fixture-based audit regression: sparse IDs, unnamed parents, cycles, mixed states,
// and transitive parents must survive. No cache download or network is required.
const base = { ...npcIdToPickpocketDef.get(3014)!, npcIds: [900], displayName: "Fixture" };
const fixture = [
    { id: 7, name: "null", transforms: [81, -1] },
    { id: 81, name: "Same name", transforms: [900, 901, 7] },
    { id: 900, name: "Same name", actions: ["Pickpocket"] },
    { id: 901, name: "Same name", actions: ["Talk-to"] },
];
const morphAudit = auditPickpocketNpcs(fixture, [base], true);
assert.equal(morphAudit.summary.morphCoverage, "complete");
assert.deepEqual(morphAudit.morphParents.map(p => p.id), [7, 81]);
assert.deepEqual(morphAudit.morphParents[0].pickpocketDescendants, [900]);
assert.deepEqual(morphAudit.missing, []);
assert.deepEqual(auditPickpocketNpcs(fixture, [{ ...base, npcIds: [7, 900] }], true).unsafeParentAssignments, [7]);
assert.deepEqual(auditPickpocketNpcs(fixture, [base, base], true).duplicateAssignments, [900]);
assert.deepEqual(auditPickpocketNpcs(fixture, [{ ...base, npcIds: [901] }], true).invalidIds, [901]);
assert.equal(auditPickpocketNpcs([...fixture, { id: 10, name: "null", transforms: [902] }], [base], true).summary.morphCoverage, "unverified");
assert.throws(() => auditPickpocketNpcs([], []), /empty/);
assert.equal(renderPickpocketReport(morphAudit, { input: "fixture" }), renderPickpocketReport(morphAudit, { input: "fixture" }), "identical input yields deterministic report");
for (const id of [7682, 5297, 9054, 9685, 13302]) assert.equal(npcIdToPickpocketDef.get(id)?.disabledReason, undefined, "ordinary NPCs remain enabled despite area/rare reward integration gaps");
assert.equal(npcIdToPickpocketDef.get(3937)?.requiredQuest, "fremennik_trials");
console.log("pickpocket-catalog.test.ts: all assertions passed");
