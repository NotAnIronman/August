import assert from "node:assert/strict";

import {
    MEMBERS_QUEST_CONTENT,
    buildMembersQuestOverview,
    buildMembersQuestJournal,
    getMembersQuestContent,
} from "../gamemodes/vanilla/quests/content/members";
import { FREE_TO_PLAY_QUEST_CONTENT } from "../gamemodes/vanilla/quests/content/freeToPlay";
import { VANILLA_QUEST_CATALOG } from "../gamemodes/vanilla/questCatalog";

const porcine = getMembersQuestContent("A Porcine of Interest");
assert.ok(porcine);
assert.match(buildMembersQuestJournal(porcine).join("\n"), /Sourhog/);

const magnetism = getMembersQuestContent("animal magnetism");
assert.ok(magnetism);
assert.match(buildMembersQuestOverview(magnetism).join("\n"), /Ava's attractor/);

const ham = getMembersQuestContent("Another Slice of H.A.M.");
assert.ok(ham);
assert.match(buildMembersQuestOverview(ham).join("\n"), /Ancient mace/);

const fenkenstrain = getMembersQuestContent("Creature of Fenkenstrain");
assert.ok(fenkenstrain);
assert.match(buildMembersQuestJournal(fenkenstrain).join("\n"), /Experiment \(level 51\)/);

const darkness = getMembersQuestContent("darkness of hallowvale");
assert.ok(darkness);
assert.match(buildMembersQuestOverview(darkness).join("\n"), /Meiyerditch/);

const elemental = getMembersQuestContent("Elemental Workshop I");
assert.ok(elemental);
assert.match(buildMembersQuestOverview(elemental).join("\n"), /Elemental shield/);

assert.equal(MEMBERS_QUEST_CONTENT.length, 157, "expected complete members quest coverage");

const freeToPlayNames = new Set(FREE_TO_PLAY_QUEST_CONTENT.map((content) => content.displayName));
const catalogMembers = VANILLA_QUEST_CATALOG.filter((quest) => !freeToPlayNames.has(quest.displayName));
const memberNames = new Set(MEMBERS_QUEST_CONTENT.map((content) => content.displayName));

assert.equal(catalogMembers.length, 157, "expected exactly 157 member quests in the catalog");
assert.equal(memberNames.size, MEMBERS_QUEST_CONTENT.length, "members quest content names must be unique");
assert.equal(new Set(MEMBERS_QUEST_CONTENT.map((content) => content.key)).size, MEMBERS_QUEST_CONTENT.length, "members quest content keys must be unique");

for (const quest of catalogMembers) {
    assert.ok(memberNames.has(quest.displayName), `${quest.displayName} must have members journal content`);
}

for (const content of MEMBERS_QUEST_CONTENT) {
    assert.ok(
        VANILLA_QUEST_CATALOG.some((quest) => quest.displayName === content.displayName),
        `${content.displayName} must exist in the visible quest catalog`,
    );
    assert.equal(getMembersQuestContent(content.key), content, `${content.displayName} must resolve by key`);
    assert.equal(getMembersQuestContent(content.displayName), content, `${content.displayName} must resolve by display name`);

    assert.ok(content.description.trim(), `${content.displayName} must have a description`);
    assert.ok(content.overviewStartText.trim(), `${content.displayName} must have start text`);
    assert.ok(content.journalInfo.difficulty.trim(), `${content.displayName} must have a difficulty`);
    assert.ok(content.journalInfo.length.trim(), `${content.displayName} must have a length`);
    assert.ok(content.journalInfo.storyline.trim(), `${content.displayName} must have a storyline`);
    assert.ok(content.rewards.length > 0, `${content.displayName} must have rewards`);
    assert.ok(content.outline.length > 0, `${content.displayName} must have an outline`);
    assert.ok(buildMembersQuestJournal(content).length > 4, `${content.displayName} journal must render`);
    assert.ok(buildMembersQuestOverview(content).length > 4, `${content.displayName} overview must render`);
}

console.log("members quest content tests passed");
