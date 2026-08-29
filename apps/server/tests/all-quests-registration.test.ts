import assert from "node:assert/strict";

import { registerQuestHandlers, getRegisteredQuests } from "@server/content/gamemodes/vanilla/quests";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import type { ScriptServices } from "@server/game/scripts/types";

const noop = (): undefined => undefined;
const emptyFacade = new Proxy({}, { get: () => noop });
const services = new Proxy(
    { system: { logger: { debug: noop, info: noop, warn: noop, error: noop } } },
    {
        get: (target, property) =>
            property in target
                ? target[property as keyof typeof target]
                : emptyFacade,
    },
) as unknown as ScriptServices;

registerQuestHandlers(new ScriptRegistry(), services);

const quests = getRegisteredQuests();
assert.equal(quests.length, 65);
assert.equal(new Set(quests.map((quest) => quest.key)).size, quests.length);
const varpQuests = quests.filter((quest) => quest.varpId !== undefined);
const varbitQuests = quests.filter((quest) => quest.varbitId !== undefined);
assert.equal(varpQuests.length + varbitQuests.length, quests.length);
assert.equal(new Set(varpQuests.map((quest) => quest.varpId)).size, varpQuests.length);
assert.equal(new Set(varbitQuests.map((quest) => quest.varbitId)).size, varbitQuests.length);

for (const expected of [
    "Big Chompy Bird Hunting",
    "Biohazard",
    "Dragon Slayer I",
    "Eadgar's Ruse",
    "Horror from the Deep",
    "Legend's Quest",
    "Observatory Quest",
    "Regicide",
    "Shilo Village",
    "Tai Bwo Wannai Trio",
    "The Fremennik Trials",
    "The Ribbiting Tale of a Lily Pad Labour Dispute",
    "Underground Pass",
    "Watchtower",
]) {
    assert(quests.some((quest) => quest.name === expected), `${expected} was not registered`);
}

console.log(`All ${quests.length} quest definitions registered without state collisions.`);
