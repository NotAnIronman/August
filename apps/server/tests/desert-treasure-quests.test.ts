/**
 * Regression coverage for the Desert Treasure I quest chain and Ancient
 * Magicks unlock contract.
 *
 * Run with: pnpm exec tsx tests/desert-treasure-quests.test.ts
 */
import assert from "node:assert/strict";

import { createProjectileParamsProvider } from "@server/content/gamemodes/vanilla/data/projectileParams";
import { createSpellDataProvider } from "@server/content/gamemodes/vanilla/data/spells";
import { takeQuestItems } from "@server/content/gamemodes/vanilla/quests/QuestService";
import { deathPlateauQuest } from "@server/content/gamemodes/vanilla/quests/definitions/death-plateau";
import { desertTreasureIQuest } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-i";
import {
    DT_DIRECT_PREREQUISITES,
    QUEST_KEYS,
    QUEST_STATE,
} from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-series/constants";
import { digSiteQuest } from "@server/content/gamemodes/vanilla/quests/definitions/dig-site";
import { priestInPerilQuest } from "@server/content/gamemodes/vanilla/quests/definitions/priest-in-peril";
import { templeOfIkovQuest } from "@server/content/gamemodes/vanilla/quests/definitions/temple-of-ikov";
import { touristTrapQuest } from "@server/content/gamemodes/vanilla/quests/definitions/tourist-trap";
import { trollStrongholdQuest } from "@server/content/gamemodes/vanilla/quests/definitions/troll-stronghold";
import { waterfallQuest } from "@server/content/gamemodes/vanilla/quests/definitions/waterfall-quest";
import { ANCIENT_TELEPORTS } from "@server/data/teleportDestinations";
import { getProviderRegistry, resetProviderRegistry } from "@server/game/providers/ProviderRegistry";
import { findBuiltinCommand } from "@server/game/commands/BuiltinCommandCatalog";

const DESERT_TREASURE_QUESTS = [
    deathPlateauQuest,
    digSiteQuest,
    templeOfIkovQuest,
    touristTrapQuest,
    trollStrongholdQuest,
    priestInPerilQuest,
    waterfallQuest,
    desertTreasureIQuest,
];

const expectedState = [
    ["Death Plateau", 314, 80],
    ["The Dig Site", 131, 9],
    ["Temple of Ikov", 26, 80],
    ["The Tourist Trap", 197, 30],
    ["Troll Stronghold", 317, 50],
    ["Priest in Peril", 302, 60],
    ["Waterfall Quest", 65, 10],
    ["Desert Treasure I", 440, 15],
] as const;

assert.equal(DESERT_TREASURE_QUESTS.length, expectedState.length);
assert.deepEqual(
    DESERT_TREASURE_QUESTS.map(({ name, varpId, completionValue }) => [
        name,
        varpId,
        completionValue,
    ]),
    expectedState,
    "quest definitions must retain the cache's canonical names and completion states",
);
assert.equal(
    new Set(DESERT_TREASURE_QUESTS.map((quest) => quest.varpId)).size,
    DESERT_TREASURE_QUESTS.length,
    "every quest must have a distinct progress varp",
);
assert.equal(findBuiltinCommand("quest")?.permission, "developer");
assert.equal(
    findBuiltinCommand("spellbook")?.permission,
    "developer",
    "the consolidated spellbook selector must remain developer-only",
);
assert.equal(
    findBuiltinCommand("completequests"),
    undefined,
    "content commands must declare permission metadata at their ScriptRegistry registration",
);

const inventoryEntries = [{ slot: 0, itemId: 995, quantity: 100000 }];
let inventorySnapshotted = false;
const stackPlayer = {} as Parameters<typeof takeQuestItems>[0];
const stackServices = {
    inventory: {
        getInventoryItems: () => inventoryEntries,
        setInventorySlot: (_player: unknown, slot: number, itemId: number, quantity: number) => {
            inventoryEntries[slot] = { slot, itemId, quantity };
        },
        snapshotInventory: () => {
            inventorySnapshotted = true;
        },
    },
} as unknown as Parameters<typeof takeQuestItems>[1];
assert.equal(
    takeQuestItems(stackPlayer, stackServices, [
        { itemId: 995, quantity: 80000, journalLabel: "80,000 coins" },
    ]),
    true,
);
assert.deepEqual(inventoryEntries[0], { slot: 0, itemId: 995, quantity: 20000 });
assert.equal(inventorySnapshotted, true);
assert.equal(
    DESERT_TREASURE_QUESTS.reduce((total, quest) => total + quest.rewards.questPoints, 0),
    12,
    "the full prerequisite chain plus Desert Treasure I should award 12 quest points",
);

assert.deepEqual(DT_DIRECT_PREREQUISITES, [
    QUEST_KEYS.digSite,
    QUEST_KEYS.templeOfIkov,
    QUEST_KEYS.touristTrap,
    QUEST_KEYS.trollStronghold,
    QUEST_KEYS.priestInPeril,
    QUEST_KEYS.waterfall,
]);
assert.equal(
    QUEST_STATE[QUEST_KEYS.deathPlateau].completionValue,
    80,
    "Death Plateau remains Troll Stronghold's nested prerequisite",
);

getProviderRegistry().projectileParams = createProjectileParamsProvider();
const spellProvider = createSpellDataProvider();
for (const spellId of [4629, 4651]) {
    const spell = spellProvider.getSpellData(spellId);
    assert.equal(spell?.spellbook, "ancient");
    assert.ok(
        spell?.unlockRequirements?.some(
            ({ varpId, minValue }) =>
                varpId === desertTreasureIQuest.varpId &&
                minValue === desertTreasureIQuest.completionValue,
        ),
        `Ancient combat spell ${spellId} must unlock at Desert Treasure I completion`,
    );
}

assert.ok(ANCIENT_TELEPORTS.length > 0);
for (const teleport of ANCIENT_TELEPORTS) {
    assert.ok(
        teleport.unlockRequirements?.some(
            ({ varpId, minValue }) =>
                varpId === desertTreasureIQuest.varpId &&
                minValue === desertTreasureIQuest.completionValue,
        ),
        `${teleport.name} must unlock at Desert Treasure I completion`,
    );
}

resetProviderRegistry();

console.log("desert-treasure-quests.test.ts: all assertions passed");
