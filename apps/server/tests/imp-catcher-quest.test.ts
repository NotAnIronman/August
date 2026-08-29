import assert from "node:assert/strict";

import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import type { ScriptServices } from "@server/game/scripts/types";
import { impCatcherQuest } from "@server/content/gamemodes/vanilla/quests/definitions/imp-catcher";
import {
    AMULET_OF_ACCURACY_ITEM_ID,
    REQUIRED_ITEMS,
    VARP_IMP_CATCHER,
    WIZARD_MIZGOG_NPC_ID,
} from "@server/content/gamemodes/vanilla/quests/definitions/imp-catcher/constants";

assert.equal(impCatcherQuest.name, "Imp Catcher");
assert.equal(impCatcherQuest.varpId, VARP_IMP_CATCHER);
assert.equal(impCatcherQuest.completionValue, 2);
assert.equal(impCatcherQuest.rewards.questPoints, 1);
assert.deepEqual(impCatcherQuest.rewards.xp, [{ skillId: 6, amount: 875, label: "Magic" }]);
assert.equal(impCatcherQuest.rewards.items?.[0]?.itemId, AMULET_OF_ACCURACY_ITEM_ID);
assert.deepEqual(
    REQUIRED_ITEMS.map(({ itemId }) => itemId),
    [1474, 1470, 1476, 1472],
);

const registry = new ScriptRegistry();
impCatcherQuest.register(registry, {} as ScriptServices);
assert.ok(registry.findNpcInteractionDirect(WIZARD_MIZGOG_NPC_ID, "talk-to"));
assert.ok(registry.findNpcInteractionDirect(WIZARD_MIZGOG_NPC_ID));

console.log("imp-catcher-quest.test.ts: all assertions passed");
