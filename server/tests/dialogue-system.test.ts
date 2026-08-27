import assert from "node:assert/strict";

import { DialogueActionRegistry } from "../src/game/dialogue/DialogueActionRegistry";
import { selectWeightedDialoguePoolEntry, validateDialogueTreeJson } from "../src/game/dialogue/DialogueTree";
import { parseWikiTranscript } from "../src/game/dialogue/WikiTranscriptParser";

const player = { id: 42 } as any;

const weighted = [
    { id: "common", weight: 3, steps: [{ kind: "line", speaker: "npc", text: ["Common"] }] },
    { id: "rare", weight: 1, steps: [{ kind: "line", speaker: "npc", text: ["Rare"] }] },
] as any;
assert.equal(selectWeightedDialoguePoolEntry(weighted, () => 0)?.id, "common");
assert.equal(selectWeightedDialoguePoolEntry(weighted, () => 0.99)?.id, "rare");

assert.deepEqual(validateDialogueTreeJson({ steps: [{ kind: "pool", entries: weighted }] }), []);
assert.deepEqual(validateDialogueTreeJson({
    steps: [{ kind: "action", action: { type: "invoke", key: "slayer.assignTask", args: { master: "duradel" } } }],
}), []);

const registry = new DialogueActionRegistry();
let invokedNpc = -1;
registry.register("slayer.assignTask", (context) => {
    invokedNpc = context.npcId;
    return "continue";
});
assert.equal(registry.invoke("slayer.assignTask", {
    player,
    services: {} as any,
    npcId: 405,
    npcName: "Duradel",
    args: { master: "duradel" },
}), "continue");
assert.equal(invokedNpc, 405);
assert.throws(() => registry.register("slayer.assignTask", () => {}), /already registered/);

const fixture = `{{Transcript|npc}}
==Standard dialogue==
* {{trandom}}
* {{topt|Dialogue 1}}
** '''Player:''' Hello.
** '''Guide:''' Welcome, traveller.
** {{tact|end}}
* {{topt|Dialogue 2}}
** '''Player:''' Do you have work for me?
** '''Guide:''' Choose a job.
** {{topt|Gather supplies.}}
*** '''Player:''' I will gather supplies.
*** {{tact|end}}
** {{topt|Fight monsters.}}
*** '''Player:''' I will fight monsters.
*** {{qact|The guide assigns a combat task.}}
*** {{tact|end}}`;

const draft = parseWikiTranscript(fixture, {
    pageTitle: "Transcript:Guide",
    displayTitle: "Dialogue for Guide",
    revisionId: 123,
    url: "https://oldschool.runescape.wiki/w/Transcript:Guide",
    retrievedAt: "2026-08-27T00:00:00.000Z",
}, { suggestedNpcId: 1, section: "Standard dialogue" });

assert.equal(draft.sections.length, 1);
const section = draft.sections[0];
assert.equal(section.status, "needs-review");
assert.equal(section.tree.steps[0]?.kind, "pool");
assert.equal((section.tree.steps[0] as any).entries.length, 2);
assert.equal((section.tree.steps[0] as any).entries[1].steps[2].kind, "options");
assert.equal(section.unresolved.length, 1);
assert.equal(section.unresolved[0].kind, "action");
assert.match(section.unresolved[0].text, /assigns a combat task/i);
assert.deepEqual(validateDialogueTreeJson(section.tree), []);

console.log("dialogue pool, action registry, and Wiki transcript importer tests passed");
