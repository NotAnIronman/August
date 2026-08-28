import assert from "node:assert/strict";

import {
    extractWikitextDropProvenance,
    extractWikitextOutcomeIds,
    hardenRestrictedSnapshotRecord,
    loadItemIdsByName,
    migrateKnownPreRollTable,
    migrateSnapshotRecord,
    parseBucketDropTable,
    parseWikitextDropTable,
    selectDropCheckpoint,
} from "../scripts/sync-osrs-npc-drops";

const bucketRow = (
    drop: Record<string, unknown>,
    rareDropTable: boolean = false,
) => ({
    page_name_sub: "K'ril Tsutsaroth",
    rare_drop_table: rareDropTable,
    drop_json: JSON.stringify({
        "Drop type": "combat",
        "Drop level": "650",
        "Dropped from": "K'ril Tsutsaroth",
        "Drop Quantity": "1",
        "Quantity Low": 1,
        "Quantity High": 1,
        Rolls: 1,
        ...drop,
    }),
});

const itemIds = new Map<string, number>([
    ["infernal ashes", 25780],
    ["rune sword", 1289],
    ["coins", 995],
    ["grimy lantadyme", 2485],
    ["dragon spear", 1249],
    ["clue scroll (elite)", 12073],
    ["giant key", 20754],
    ["brimstone key", 23083],
    ["looting bag", 11941],
    ["ecumenical key", 11942],
    ["larran's key", 23490],
    ["slayer's enchantment", 21257],
    ["granite maul", 4153],
    ["mystic robe top (dark)", 4101],
    ["unsired", 13273],
    ["frozen key piece (zamorak)", 26362],
]);

const imported = parseBucketDropTable(
    { id: 3129, name: "K'ril Tsutsaroth", combatLevel: 650 },
    [
        bucketRow({ "Dropped item": "Infernal ashes", Rarity: "Always" }),
        bucketRow({ "Dropped item": "Rune sword", Rarity: "1/4" }),
        bucketRow({ "Dropped item": "Coins", Rarity: "1/4", "Drop Quantity": "19500-20000", "Quantity Low": 19500, "Quantity High": 20000 }),
        bucketRow({ "Dropped item": "Grimy lantadyme", Rarity: "1/2", "Drop Quantity": "10 (noted)", "Quantity Low": 10, "Quantity High": 10 }),
        bucketRow({ "Dropped item": "Dragon spear", Rarity: "1/1,016" }, true),
        bucketRow({ "Dropped item": "Clue scroll (elite)", Rarity: "1/250" }),
        bucketRow({ "Dropped item": "Giant key", Rarity: "1/128", "Alt Rarity": "2/128" }),
        bucketRow({ "Dropped item": "Brimstone key", Rarity: "1/50" }),
        bucketRow({ "Dropped item": "Looting bag", Rarity: "1/5" }),
        bucketRow({ "Dropped item": "Larran's key", Rarity: "1/25" }),
        bucketRow({ "Dropped item": "Slayer's enchantment", Rarity: "1/25" }),
        bucketRow({ "Dropped item": "Coins", Rarity: "1/1", "Drop level": "100" }),
    ],
    itemIds,
);

assert.deepEqual(imported.errors, []);
assert.equal(imported.table?.always?.[0]?.itemId, 25780);

const frozenKeyBucket = parseBucketDropTable(
    { id: 3129, name: "K'ril Tsutsaroth", combatLevel: 650 },
    [
        bucketRow({ "Dropped item": "Infernal ashes", Rarity: "Always" }),
        bucketRow({ "Dropped item": "Frozen key piece (zamorak)", Rarity: "Always" }),
    ],
    itemIds,
);
assert(
    frozenKeyBucket.errors.some((error) => error.includes("The Frozen Door")),
    "conditionally guaranteed Frozen Door rows must keep a Bucket record retryable",
);
assert.deepEqual(
    frozenKeyBucket.table?.always?.map((entry) => entry.itemId),
    [25780],
    "a visually Always frozen key piece must be omitted until miniquest state is authoritative",
);

const frozenKeyFallback = parseWikitextDropTable(`
==Drops==
===100%===
{{DropsLine|name=Infernal ashes|quantity=1|rarity=Always}}
{{DropsLine|name=Frozen key piece (zamorak)|quantity=1|rarity=Always}}
`, itemIds);
assert(
    frozenKeyFallback.errors.some((error) => error.includes("The Frozen Door")),
    "the wikitext fallback must also expose the unresolved miniquest condition",
);
assert.deepEqual(
    frozenKeyFallback.table?.always?.map((entry) => entry.itemId),
    [25780],
    "the fallback must never promote a conditional 100% quest row to unconditional loot",
);

const main = imported.table?.pools?.find((pool) => pool.category === "main");
assert.equal(main?.kind, "weighted");
assert.equal(main?.entries.length, 3);
assert.deepEqual(
    main?.entries.find((entry) => entry.itemId === 2485),
    { itemId: 2485, quantity: "10 (noted)", rarity: "1/2" },
);
assert.equal(main?.entries.find((entry) => entry.itemId === 995)?.quantity, "19500-20000");

const shared = imported.table?.pools?.find((pool) => pool.category === "shared");
assert.equal(shared?.kind, "weighted");
assert.equal(shared?.entries[0]?.rarity, "1/1016");
assert.equal(
    main?.rollGroupId,
    shared?.rollGroupId,
    "ordinary and expanded shared rows must identify the same exclusive Wiki roll",
);

const tertiary = imported.table?.pools?.find((pool) => pool.category === "tertiary");
assert.equal(tertiary?.kind, "independent");
assert.equal(tertiary?.entries[0]?.itemId, 12073);
assert.equal(
    tertiary?.entries.some((entry) => entry.itemId === 20754),
    true,
    "pre-roll keys must accompany rather than consume the ordinary main-table roll",
);
assert.deepEqual(
    tertiary?.entries.find((entry) => entry.itemId === 20754),
    {
        itemId: 20754,
        quantity: "1",
        rarity: "1/128",
        altRarity: "2/128",
        altCondition: { wildernessOnly: true },
    },
    "the giant-key Wilderness rate must remain conditional",
);
assert.deepEqual(
    tertiary?.entries.find((entry) => entry.itemId === 23083)?.condition,
    { slayerTaskOnly: true, requiredSlayerMaster: "konar quo maten" },
    "Brimstone keys must remain exclusive to Konar Slayer assignments",
);
assert.deepEqual(
    tertiary?.entries.find((entry) => entry.itemId === 11941)?.condition,
    { wildernessOnly: true },
    "Looting bags must be an independent Wilderness-only tertiary roll",
);
for (const itemId of [23490, 21257]) {
    assert.deepEqual(
        tertiary?.entries.find((entry) => entry.itemId === itemId)?.condition,
        {
            recipientWildernessOnly: true,
            slayerTaskOnly: true,
            requiredSlayerMaster: "krystilia",
        },
        "Krystilia-only drops must check the recipient's Wilderness position",
    );
}

const restrictedFallback = parseWikitextDropTable(`
== Drops ==
=== Tertiary ===
{{DropsLine|name=Larran's key|quantity=1|rarity=1/25}}
{{DropsLine|name=Slayer's enchantment|quantity=1|rarity=1/25}}
{{DropsLine|name=Brimstone key|quantity=1|rarity=1/50}}
{{DropsLine|name=Ecumenical key|quantity=1|rarity=1/60}}
{{DropsLine|name=Looting bag|quantity=1|rarity=1/5}}
`, itemIds);
assert.deepEqual(restrictedFallback.errors, []);
const fallbackEntries = restrictedFallback.table?.pools?.flatMap((pool) => pool.entries) ?? [];
for (const itemId of [23490, 21257]) {
    assert.deepEqual(
        fallbackEntries.find((entry) => entry.itemId === itemId)?.condition,
        {
            recipientWildernessOnly: true,
            slayerTaskOnly: true,
            requiredSlayerMaster: "krystilia",
        },
        "wikitext fallback must preserve Krystilia reward eligibility",
    );
}
assert.deepEqual(
    fallbackEntries.find((entry) => entry.itemId === 23083)?.condition,
    { slayerTaskOnly: true, requiredSlayerMaster: "konar quo maten" },
    "wikitext fallback must preserve Konar reward eligibility",
);
assert.deepEqual(
    fallbackEntries.find((entry) => entry.itemId === 11942)?.condition,
    { wildernessGodWarsDungeonOnly: true },
    "wikitext fallback must preserve ecumenical-key location eligibility",
);
assert.deepEqual(
    fallbackEntries.find((entry) => entry.itemId === 11941)?.condition,
    { wildernessOnly: true },
    "wikitext fallback must preserve looting-bag location eligibility",
);
const cosmeticFallback = parseWikitextDropTable(`
== Drops ==
=== Weapons and armour ===
{{DropsLine|name=Rune sword|quantity=1|rarity=1/2}}
=== Runes and ammunition ===
{{DropsLine|name=Coins|quantity=100|rarity=1/2}}
`, itemIds);
const cosmeticWeightedPools = cosmeticFallback.table?.pools?.filter(
    (pool) => pool.kind === "weighted",
) ?? [];
assert.equal(cosmeticWeightedPools.length, 2);
assert.equal(
    new Set(cosmeticWeightedPools.map((pool) => pool.rollGroupId)).size,
    1,
    "wikitext display categories must share one exclusive roll group",
);

const gargoyleSource = `
==Drops==
===Pre-roll===
{{DropsLine|name=Granite maul|quantity=1|rarity=1/256}}
{{DropsLine|name=Mystic robe top (dark)|quantity=1|rarity=1/512}}
===Weapons and armour===
{{DropsLine|name=Rune sword|quantity=1|rarity=1/1}}
`;
const gargoyleProvenance = extractWikitextDropProvenance(gargoyleSource);
assert.deepEqual(gargoyleProvenance.warnings, []);
const gargoyleImport = parseBucketDropTable(
    { id: 412, name: "Gargoyle", combatLevel: 111 },
    [
        bucketRow({
            "Dropped item": "Granite maul",
            Rarity: "1/256",
            "Drop level": "111",
            "Dropped from": "Gargoyle",
        }),
        bucketRow({
            "Dropped item": "Mystic robe top (dark)",
            Rarity: "1/512",
            "Drop level": "111",
            "Dropped from": "Gargoyle",
        }),
        bucketRow({
            "Dropped item": "Rune sword",
            Rarity: "1/1",
            "Drop level": "111",
            "Dropped from": "Gargoyle",
        }),
    ],
    itemIds,
    undefined,
    new Map(),
    gargoyleProvenance,
);
assert.deepEqual(gargoyleImport.errors, []);
assert.deepEqual(
    gargoyleImport.table?.pools?.map((pool) => [
        pool.category,
        pool.entries.map((entry) => entry.itemId),
        pool.rollChainId,
        pool.rollChainOrder,
    ]),
    [
        ["pre_roll", [4153], "wiki:drop-chain:1", 1],
        ["pre_roll", [4101], "wiki:drop-chain:1", 0],
        ["weapons_armour", [1289], "wiki:drop-chain:1", 2],
    ],
    "Gargoyle source display order must not replace the documented dark-top -> maul -> main chain",
);
const gargoyleFallback = parseWikitextDropTable(gargoyleSource, itemIds);
assert.deepEqual(
    gargoyleFallback.table?.pools?.map((pool) => [pool.category, pool.rollChainOrder]),
    [["pre_roll", 1], ["pre_roll", 0], ["weapons_armour", 2]],
    "the wikitext fallback must preserve the same ordered pre-roll chain",
);

const abyssalSireImport = parseWikitextDropTable(`
==Drops==
===Pre-roll===
{{DropsLine|name=Unsired|quantity=1|rarity=1/100}}
===Weapons and armour===
{{DropsLine|name=Rune sword|quantity=3 (noted)|rarity=4/139}}
`, itemIds);
assert.deepEqual(abyssalSireImport.errors, []);
assert.deepEqual(
    abyssalSireImport.table?.pools?.map((pool) => [
        pool.category,
        pool.rolls,
        pool.rollChainId,
        pool.rollChainOrder,
    ]),
    [
        ["pre_roll", 1, "wiki:drop-chain:1", 0],
        ["weapons_armour", 1, "wiki:drop-chain:1", 1],
    ],
    "Sire's default DropsLine count is one: Unsired is checked once before one standard roll",
);

const secondarySource = `
==Drops==
===Weapons and armour===
{{DropsLine|name=Rune sword|quantity=1|rarity=1/1}}
===Secondary supply drops===
{{DropsLine|name=Coins|quantity=100|rarity=1/2}}
`;
const secondaryImport = parseWikitextDropTable(secondarySource, itemIds);
const secondaryPools = secondaryImport.table?.pools ?? [];
assert.notEqual(
    secondaryPools.find((pool) => pool.category === "weapons_armour")?.rollGroupId,
    secondaryPools.find((pool) => pool.category === "secondary")?.rollGroupId,
    "same-count secondary tables must not coalesce with the main drop roll",
);

const wildernessUniqueImport = parseWikitextDropTable(`
==Drops==
===Unique===
{{DropsLine|name=Granite maul|quantity=1|rarity=1/100|leagueRegion=Wilderness}}
===Weapons and armour===
{{DropsLine|name=Rune sword|quantity=1|rarity=1/1|leagueRegion=Wilderness}}
===Secondary Supply roll===
{{DropsLine|name=Coins|quantity=100|rarity=1/2|leagueRegion=Wilderness}}
`, itemIds);
assert.deepEqual(wildernessUniqueImport.errors, []);
assert.deepEqual(
    wildernessUniqueImport.table?.pools?.map((pool) => [
        pool.category,
        pool.rollChainId,
        pool.rollChainOrder,
    ]),
    [
        ["unique", "wiki:drop-chain:1", 0],
        ["weapons_armour", "wiki:drop-chain:1", 1],
        ["secondary", undefined, undefined],
    ],
    "Wilderness-boss uniques short-circuit main while Secondary Supply remains an additional roll",
);

const ambiguousUnique = parseWikitextDropTable(`
==Drops==
===Unique===
{{DropsLine|name=Granite maul|quantity=1|rarity=1/100}}
===Weapons and armour===
{{DropsLine|name=Rune sword|quantity=1|rarity=99/100}}
`, itemIds);
assert(
    ambiguousUnique.errors.some((error) => error.includes("boss-specific")),
    "generic Unique headings must remain explicitly retryable instead of guessing pre-roll semantics",
);

const legacyGargoyleMigration = migrateKnownPreRollTable("Gargoyle", {
    pools: [{
        kind: "weighted",
        category: "main",
        rolls: 1,
        entries: [
            { itemId: 4153, quantity: "1", rarity: "1/256" },
            { itemId: 4101, quantity: "1", rarity: "1/512" },
            { itemId: 1289, quantity: "1", rarity: "1/1" },
        ],
    }],
});
assert.equal(legacyGargoyleMigration.changed, true);
assert.deepEqual(
    legacyGargoyleMigration.table.pools?.map((pool) => [pool.category, pool.rollChainOrder]),
    [["pre_roll", 0], ["pre_roll", 1], ["main", 2]],
    "old flattened checkpoints must gain the known Gargoyle chain deterministically",
);

const hardenedFallback = hardenRestrictedSnapshotRecord({
    npcTypeId: 413,
    name: "Gargoyle",
    source: "wiki",
    sourcePage: "Gargoyle",
    importer: "wikitext-v1",
    incomplete: true,
    table: {
        pools: [{
            kind: "independent",
            category: "tertiary",
            entries: [{ itemId: 11941, quantity: "1", rarity: "1/5" }],
        }],
    },
});
assert.equal(hardenedFallback.changedEntries, 1);
assert.deepEqual(
    hardenedFallback.record.table.pools?.[0]?.entries[0]?.condition,
    { wildernessOnly: true },
    "existing wikitext checkpoints must be safely hardened without a network refresh",
);

const migratedFrozenDoorRecord = migrateSnapshotRecord({
    npcTypeId: 3129,
    name: "K'ril Tsutsaroth",
    source: "wiki",
    sourcePage: "K'ril Tsutsaroth",
    importer: "bucket-v3",
    table: {
        always: [
            { itemId: 25780, quantity: "1", rarity: "Always" },
            { itemId: 26362, quantity: "1", rarity: "Always" },
        ],
        pools: [{
            kind: "weighted",
            category: "main",
            entries: [
                { itemId: 1289, quantity: "1", rarity: "1/2" },
                { itemId: 26362, quantity: "1", rarity: "1/20" },
            ],
        }],
    },
});
assert.equal(migratedFrozenDoorRecord.removedConditionalQuestEntries, 2);
assert.equal(migratedFrozenDoorRecord.record.incomplete, undefined);
assert.equal(migratedFrozenDoorRecord.record.omittedConditionalQuestRows, 2);
assert(
    migratedFrozenDoorRecord.record.warnings?.some((warning) =>
        warning.includes("The Frozen Door"),
    ),
);
assert.deepEqual(
    [
        ...(migratedFrozenDoorRecord.record.table.always ?? []),
        ...(migratedFrozenDoorRecord.record.table.pools ?? []).flatMap((pool) => pool.entries),
    ].map((entry) => entry.itemId),
    [25780, 1289],
    "snapshot migration must atomically remove both guaranteed and probabilistic unsafe key-piece rows",
);
const repairedFrozenDoorMetadata = migrateSnapshotRecord({
    ...migratedFrozenDoorRecord.record,
    incomplete: true,
    omittedConditionalQuestRows: undefined,
});
assert.equal(repairedFrozenDoorMetadata.record.incomplete, undefined);
assert.equal(repairedFrozenDoorMetadata.record.omittedConditionalQuestRows, 1);
assert.equal(repairedFrozenDoorMetadata.changedConditionalQuestMetadata, true);

assert.equal(loadItemIdsByName().get("coins"), 995);
assert.equal(loadItemIdsByName().get("vampyre dust"), 3325);
assert.equal(loadItemIdsByName().get("medium ninja monkey bones"), 3180);
assert.equal(loadItemIdsByName().get("giant champion scroll"), 6800);
assert.equal(loadItemIdsByName().get("map part (lozar)"), 1536);
assert.equal(loadItemIdsByName().get("dragonstone bolt tips"), 9193);
assert.equal(loadItemIdsByName().get("dragonstone bolts (e)"), 21948);

const exclusiveCoins = parseBucketDropTable(
    { id: 3129, name: "K'ril Tsutsaroth", combatLevel: 650 },
    [
        bucketRow({ "Dropped item": "Rune sword", Rarity: "7/10" }),
        bucketRow({ "Dropped item": "Coins", Rarity: "3/10" }),
    ],
    itemIds,
);
assert.deepEqual(exclusiveCoins.errors, []);
assert.equal(
    exclusiveCoins.table?.pools?.find((pool) => pool.category === "main")?.entries.length,
    2,
);
assert.equal(
    exclusiveCoins.table?.pools?.some((pool) => pool.kind === "independent" && pool.category === "coins"),
    false,
);

const pairedSource = `
== Drops ==
=== Potions ===
{{DropsLine|name=Super attack(3)|quantity=3|rarity=8/127|raritynotes=<ref name="paired-potions">These potions are always dropped together.</ref>}}
{{DropsLine|name=Super strength(3)|quantity=3|rarity=8/127|raritynotes=<ref name="paired-potions"/>}}
`;
const outcomes = extractWikitextOutcomeIds(pairedSource);
assert.equal(outcomes.get("super attack(3)"), "wiki:paired-potions");
assert.equal(outcomes.get("super strength(3)"), "wiki:paired-potions");

const checkpointRecord = (incomplete: boolean, entries: number) => ({
    npcTypeId: 3129,
    name: "K'ril Tsutsaroth",
    source: "wiki" as const,
    sourcePage: "K'ril Tsutsaroth",
    importer: "bucket-v3",
    incomplete: incomplete || undefined,
    table: {
        pools: [{
            kind: "weighted" as const,
            category: "main" as const,
            entries: Array.from({ length: entries }, (_, index) => ({
                itemId: 1000 + index,
                quantity: "1",
                rarity: "1/100",
            })),
        }],
    },
});
const completeCheckpoint = checkpointRecord(false, 3);
const partialCheckpoint = checkpointRecord(true, 2);
assert.equal(
    selectDropCheckpoint(completeCheckpoint, partialCheckpoint).record,
    completeCheckpoint,
    "an incomplete refresh must not overwrite a complete live table",
);
const largerPartialCheckpoint = checkpointRecord(true, 4);
assert.equal(
    selectDropCheckpoint(largerPartialCheckpoint, partialCheckpoint).record,
    largerPartialCheckpoint,
    "a partial refresh must not shrink an existing partial checkpoint",
);
assert.equal(
    selectDropCheckpoint(partialCheckpoint, largerPartialCheckpoint).record,
    largerPartialCheckpoint,
    "a partial refresh may increase usable coverage while remaining retryable",
);
const noisyPartialCheckpoint = {
    ...checkpointRecord(true, 20),
    warnings: Array.from({ length: 8 }, (_, index) => `old warning ${index}`),
};
const cleanerPartialCheckpoint = {
    ...checkpointRecord(true, 19),
    warnings: ["one explicitly unsupported contextual row"],
};
assert.equal(
    selectDropCheckpoint(noisyPartialCheckpoint, cleanerPartialCheckpoint).record,
    noisyPartialCheckpoint,
    "warning-count changes alone cannot justify deleting partial-table rows",
);
const disjointPartialCheckpoint = {
    ...checkpointRecord(true, 20),
    table: {
        pools: [{
            kind: "weighted" as const,
            category: "main" as const,
            entries: Array.from({ length: 20 }, (_, index) => ({
                itemId: 5000 + index,
                quantity: "1",
                rarity: "1/20",
            })),
        }],
    },
};
assert.equal(
    selectDropCheckpoint(noisyPartialCheckpoint, disjointPartialCheckpoint).record,
    noisyPartialCheckpoint,
    "equal row counts cannot hide replacement of the prior semantic entries",
);
const structuralCheckpoint = ({
    kind = "weighted" as const,
    category = "main" as const,
    rolls = 1,
    rollGroupId,
    rollChainId,
    rollChainOrder,
    condition,
}: {
    kind?: "weighted" | "independent";
    category?: "main" | "tertiary";
    rolls?: number;
    rollGroupId?: string;
    rollChainId?: string;
    rollChainOrder?: number;
    condition?: {
        wildernessOnly?: boolean;
        recipientWildernessOnly?: boolean;
        slayerTaskOnly?: boolean;
        requiredSlayerMaster?: string;
        requiredAnyEquippedItemIds?: number[];
    };
}) => ({
    ...checkpointRecord(true, 1),
    table: {
        pools: [{
            kind,
            category,
            rollGroupId,
            rollChainId,
            rollChainOrder,
            rolls,
            entries: [{
                itemId: 23490,
                quantity: "1",
                rarity: "1/25",
                condition,
            }],
        }],
    },
});
const conditionedPartialCheckpoint = structuralCheckpoint({
    condition: {
        recipientWildernessOnly: true,
        requiredSlayerMaster: "Krystilia",
        requiredAnyEquippedItemIds: [20790, 12785],
    },
});
const hardenedConditionCheckpoint = structuralCheckpoint({
    condition: {
        recipientWildernessOnly: true,
        slayerTaskOnly: true,
        requiredSlayerMaster: "krystilia",
    },
});
assert.equal(
    selectDropCheckpoint(structuralCheckpoint({}), hardenedConditionCheckpoint).record,
    hardenedConditionCheckpoint,
    "adding a known fail-closed restricted condition must not be rejected as semantic data loss",
);
assert.equal(
    selectDropCheckpoint(conditionedPartialCheckpoint, structuralCheckpoint({})).record,
    conditionedPartialCheckpoint,
    "a partial refresh cannot silently remove a contextual drop condition",
);
for (const candidate of [
    structuralCheckpoint({
        kind: "independent",
        condition: conditionedPartialCheckpoint.table.pools[0]?.entries[0]?.condition,
    }),
    structuralCheckpoint({
        category: "tertiary",
        condition: conditionedPartialCheckpoint.table.pools[0]?.entries[0]?.condition,
    }),
    structuralCheckpoint({
        rolls: 2,
        condition: conditionedPartialCheckpoint.table.pools[0]?.entries[0]?.condition,
    }),
    structuralCheckpoint({
        rollGroupId: "wiki:exclusive:alternate",
        condition: conditionedPartialCheckpoint.table.pools[0]?.entries[0]?.condition,
    }),
    structuralCheckpoint({
        rollChainId: "wiki:drop-chain:1",
        rollChainOrder: 1,
        condition: conditionedPartialCheckpoint.table.pools[0]?.entries[0]?.condition,
    }),
]) {
    assert.equal(
        selectDropCheckpoint(conditionedPartialCheckpoint, candidate).record,
        conditionedPartialCheckpoint,
        "a partial refresh cannot move an entry across pool kind/category/roll semantics",
    );
}
const equivalentConditionCheckpoint = structuralCheckpoint({
    condition: {
        requiredAnyEquippedItemIds: [12785, 20790, 12785],
        requiredSlayerMaster: "  KRYSTILIA  ",
        recipientWildernessOnly: true,
    },
});
assert.equal(
    selectDropCheckpoint(conditionedPartialCheckpoint, equivalentConditionCheckpoint).record,
    equivalentConditionCheckpoint,
    "runtime-equivalent condition ordering and spelling must serialize deterministically",
);
const fallbackCheckpoint = {
    ...checkpointRecord(false, 50),
    importer: "wikitext-v1",
};
assert.equal(
    selectDropCheckpoint(completeCheckpoint, fallbackCheckpoint).record,
    completeCheckpoint,
    "a fallback parser cannot replace a complete structured checkpoint",
);

const wrongVersion = parseBucketDropTable(
    { id: 999, name: "Versioned monster", combatLevel: 10 },
    [
        {
            ...bucketRow({ "Dropped item": "Rune sword", Rarity: "1/1", "Drop level": "10" }),
            page_name_sub: "Versioned monster#Other",
        },
    ],
    itemIds,
    "Versioned monster#Standard",
);
assert.equal(wrongVersion.table, undefined);
assert(
    wrongVersion.errors.some((error) => error.includes("no Bucket rows matched exact NPC version")),
    "an absent exact anchor must not inherit another version's rows",
);

const distinctRollCounts = parseBucketDropTable(
    { id: 3129, name: "K'ril Tsutsaroth", combatLevel: 650 },
    [
        bucketRow({ "Dropped item": "Rune sword", Rarity: "1/10", Rolls: 1 }),
        bucketRow({ "Dropped item": "Rune sword", Rarity: "1/10", Rolls: 2 }),
    ],
    itemIds,
);
assert.deepEqual(
    distinctRollCounts.table?.pools?.map((pool) => pool.rolls).sort(),
    [1, 2],
    "identical rows with distinct roll counts must not be deduplicated",
);

console.log("NPC structured drop importer tests passed");
