import assert from "node:assert/strict";

import { resolveDropEntry, resolveDropPool } from "@server/game/drops/dropTableResolver";
import { selectImportedIdCandidate } from "@server/game/drops/NpcDropRegistry";
import {
    normalizeWikiDropTable,
    prioritizeImportedDefinitions,
} from "@server/game/drops/monstersCompleteSource";

const notedMagicLogs = resolveDropEntry({
    itemId: 1513,
    quantity: "15-20 (noted)",
    rarity: "1/1",
});
assert.equal(notedMagicLogs?.itemId, 1514);
assert.deepEqual(notedMagicLogs?.quantity, { min: 15, max: 20 });

const ordinaryMagicLogs = resolveDropEntry({
    itemId: 1513,
    quantity: "15-20",
    rarity: "1/1",
});
assert.equal(ordinaryMagicLogs?.itemId, 1513);

const legacyCoinId = resolveDropEntry({
    itemId: 617,
    quantity: "250",
    rarity: "1/1",
});
assert.equal(legacyCoinId?.itemId, 995, "legacy coin IDs must be canonicalized at runtime");

const namedCoins = resolveDropEntry({
    itemName: "Coins",
    quantity: "250",
    rarity: "1/1",
});
assert.equal(namedCoins?.itemId, 995, "ambiguous coin names must resolve to the stackable item");

const formattedWikiRate = resolveDropEntry({
    itemId: 1513,
    quantity: "15\u201320",
    rarity: "1/1,016",
});
assert.deepEqual(formattedWikiRate?.quantity, { min: 15, max: 20 });
assert.equal(formattedWikiRate?.probability, 1 / 1016);

const bundledPool = resolveDropPool({
    kind: "weighted",
    category: "main",
    entries: [
        { itemId: 145, rarity: "1/2", outcomeId: "paired-potions" },
        { itemId: 157, rarity: "1/2", outcomeId: "paired-potions" },
        { itemId: 995, rarity: "1/2" },
    ],
});
assert.equal(bundledPool?.nothingProbability, 0);
assert.deepEqual(
    bundledPool?.entries.map((entry) => [entry.itemId, entry.probability, entry.outcomeId]),
    [
        [145, 0.5, "paired-potions"],
        [157, 0.5, "paired-potions"],
        [995, 0.5, undefined],
    ],
    "paired rows consume one weighted outcome without diluting their marginal rarity",
);

const guaranteedIndependentPool = resolveDropPool({
    kind: "independent",
    category: "tertiary",
    entries: [
        { itemId: 526, rarity: "Always" },
        { itemId: 25780, rarity: "Always" },
        { itemId: 12073, rarity: "1/5" },
    ],
});
assert.deepEqual(
    guaranteedIndependentPool?.entries.map((entry) => [entry.itemId, entry.probability]),
    [
        [526, 1],
        [25780, 1],
        [12073, 0.2],
    ],
    "independent rolls retain literal probabilities even when their sum exceeds one",
);

const contextualWeightedPool = resolveDropPool({
    kind: "weighted",
    category: "main",
    entries: [
        {
            itemId: 1289,
            rarity: 0.8,
            altRarity: 0.9,
            altCondition: { wildernessOnly: true },
        },
        { itemId: 1303, rarity: 0.8 },
    ],
});
assert.deepEqual(
    contextualWeightedPool?.entries.map((entry) => [
        entry.itemId,
        entry.probability,
        entry.altProbability,
    ]),
    [
        [1289, 0.8, 0.9],
        [1303, 0.8, undefined],
    ],
    "weighted base and alternate marginals remain literal until recipient context is known",
);

const migratedWikiTable = normalizeWikiDropTable({
    pools: [
        {
            kind: "weighted",
            category: "main",
            entries: [{ itemId: 1289, rarity: "121/127" }],
        },
        {
            kind: "weighted",
            category: "shared",
            entries: [{ itemId: 1249, rarity: "1/1016" }],
        },
        {
            kind: "independent",
            category: "tertiary",
            entries: [{ itemId: 12073, rarity: "1/250" }],
        },
    ],
});
assert.deepEqual(
    migratedWikiTable.pools?.map((pool) => [
        pool.kind,
        pool.category,
        pool.rollGroupId,
    ]),
    [
        ["weighted", "main", "wiki:exclusive:1"],
        ["weighted", "shared", "wiki:exclusive:1"],
        ["independent", "tertiary", undefined],
    ],
    "existing Wiki snapshots gain explicit exclusivity without losing display categories",
);

const partialWikiDefinition = {
    npcTypeId: 412,
    name: "Gargoyle",
    source: "wiki" as const,
    incomplete: true,
    table: { pools: [{ kind: "weighted" as const, category: "main" as const, entries: [{ itemId: 4153, rarity: "1/256" }] }] },
};
const completeLegacyDefinition = {
    npcTypeId: 412,
    name: "Gargoyle",
    source: "legacy" as const,
    table: { pools: [{ kind: "weighted" as const, category: "main" as const, entries: [{ itemId: 4153, rarity: "1/256" }, { itemId: 1289, rarity: "1/4" }] }] },
};
const completeFirst = prioritizeImportedDefinitions(
    [partialWikiDefinition],
    [completeLegacyDefinition],
);
assert.equal(
    selectImportedIdCandidate(
        completeFirst.filter((entry) => entry.npcTypeId === 412),
        "Gargoyle",
    )?.source,
    "legacy",
    "a fuller complete exact-ID legacy table must not be suppressed by an incomplete Wiki fallback",
);
assert.equal(
    selectImportedIdCandidate(
        [{ name: "Stale reused cache ID", value: 1 }, { name: "Gargoyle", value: 2 }],
        "Gargoyle",
    )?.value,
    2,
    "a stale higher-ranked ID candidate must not hide a later live-name match",
);

console.log("drop note resolution tests passed");
