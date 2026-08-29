import assert from "node:assert/strict";
import fs from "node:fs";

import { DropRollService } from "@server/game/drops/DropRollService";
import { NpcDropRegistry } from "@server/game/drops/NpcDropRegistry";
import type { NpcDropTable } from "@server/game/drops/types";
import { referencePath, repositoryPath } from "@server/paths";

type SnapshotEntry = { itemId?: number; quantity?: string; rarity?: string; outcomeId?: string };
type SnapshotPool = {
    kind?: string;
    category?: string;
    rollGroupId?: string;
    entries?: SnapshotEntry[];
};

type SnapshotRecord = {
    npcTypeId?: number;
    importer?: string;
    incomplete?: boolean;
    omittedConditionalQuestRows?: number;
    table?: { always?: SnapshotEntry[]; pools?: SnapshotPool[] };
};

const snapshotPath = referencePath("npc-drops-wiki.json");
const legacyRuntimePath = repositoryPath("apps", "server", "data", "npc-drops-wiki.json");
assert.equal(
    fs.existsSync(legacyRuntimePath),
    false,
    "the NPC drop snapshot must have one canonical source under data/references",
);

const snapshotText = fs.readFileSync(snapshotPath, "utf8");
assert.equal(
    /"itemId"\s*:\s*617\b/.test(snapshotText),
    false,
    "the canonical NPC drop snapshot must not contain non-canonical coin drops",
);

const snapshot = JSON.parse(snapshotText) as {
    records?: SnapshotRecord[];
    failures?: Array<{ npcTypeId?: number }>;
};
const frozenKeyPieceIds = new Set([26358, 26359, 26360, 26361, 26362, 26363, 26364, 26365]);
for (const record of snapshot.records ?? []) {
    const entries = [
        ...(record.table?.always ?? []),
        ...(record.table?.pools ?? []).flatMap((pool) => pool.entries ?? []),
    ];
    assert.equal(
        entries.some((entry) => entry.itemId !== undefined && frozenKeyPieceIds.has(entry.itemId)),
        false,
        `NPC ${record.npcTypeId} must not expose a conditional Frozen Door key piece as ordinary loot`,
    );
}
// 6495 is the no-reward PvM Arena form and 12446 is the Deadman-specific
// Annihilation form. Canonical main-game K'ril is cache NPC 3129.
for (const npcTypeId of [3129]) {
    const record = snapshot.records?.find((candidate) => candidate.npcTypeId === npcTypeId);
    assert(record, `K'ril cache NPC ${npcTypeId} must have an exact drop record`);
    assert.equal(record.importer, "bucket-v3");
    assert.notEqual(record.incomplete, true);
    assert.equal(record.omittedConditionalQuestRows, 1);
    assert.equal(
        snapshot.failures?.some((failure) => failure.npcTypeId === npcTypeId),
        false,
    );

    const pools = record.table?.pools ?? [];
    assert(pools.some((pool) => pool.kind === "weighted" && pool.category === "main"));
    assert(pools.some((pool) => pool.kind === "weighted" && pool.category === "shared"));
    assert(pools.some((pool) => pool.kind === "independent" && pool.category === "tertiary"));
    const entries = [...(record.table?.always ?? []), ...pools.flatMap((pool) => pool.entries ?? [])];
    assert.equal(
        entries.some((entry) => entry.itemId === 26362),
        false,
        "K'ril's conditional Frozen Door key piece must not become unconditional loot",
    );
    const coins = entries.find((entry) => entry.itemId === 995);
    assert.equal(coins?.quantity, "19500-20000");
    assert.equal(
        pools.find((pool) => pool.entries?.includes(coins!))?.kind,
        "weighted",
        "K'ril's coins remain mutually exclusive with the other main-table outcomes",
    );
    assert(
        entries.some((entry) => entry.itemId === 2485 && entry.quantity === "10 (noted)"),
        "K'ril's noted grimy lantadyme drop must retain its note metadata",
    );
    for (const pair of [[145, 157], [3026, 189]]) {
        const [left, right] = pair.map((itemId) => entries.find((entry) => entry.itemId === itemId));
        assert(left?.outcomeId, `K'ril item ${pair[0]} must retain its paired outcome`);
        assert.equal(left.outcomeId, right?.outcomeId, "paired K'ril potions must roll together");
    }
}

const registry = new NpcDropRegistry({
    load: (npcTypeId: number) => ({
        id: npcTypeId,
        name:
            npcTypeId === 3129 || npcTypeId === 6495
                ? "K'ril Tsutsaroth"
                : npcTypeId === 26
                  ? "Zombie"
                  : "Null",
        combatLevel:
            npcTypeId === 3129 || npcTypeId === 6495 ? 650 : npcTypeId === 26 ? 13 : 0,
    }),
} as never);
const liveKril = registry.describe(3129);
assert.equal(liveKril.source, "imported-id", "K'ril's exact Wiki table must beat the ashes-only safety net");
assert(liveKril.entryCount > 20, "K'ril's live registry table must contain the full imported drops");
const liveKrilTable = registry.get(3129);
if (!liveKrilTable) throw new Error("K'ril's canonical runtime table must resolve");
const canonicalKrilTable: NpcDropTable = liveKrilTable;
const liveKrilWeighted = liveKrilTable.pools.filter((pool) => pool.kind === "weighted");
const liveKrilMain = liveKrilWeighted.find((pool) => pool.category === "main");
const liveKrilShared = liveKrilWeighted.find((pool) => pool.category === "shared");
assert(liveKrilMain?.rollGroupId, "K'ril's main table must have an exclusive roll group");
assert.equal(
    liveKrilMain.rollGroupId,
    liveKrilShared?.rollGroupId,
    "shared rare-table rows retain their display category but consume K'ril's one exclusive roll",
);
assert.equal(
    registry.get(26)?.pools.some((pool) => pool.kind === "independent" && pool.category === "coins"),
    false,
    "older overflow-coin checkpoints are migrated back into the exclusive main roll",
);

function randomForWeightedOutcome(table: NpcDropTable, itemId: number): number {
    const sourcePool = table.pools.find(
        (pool) => pool.kind === "weighted" && pool.entries.some((entry) => entry.itemId === itemId),
    );
    assert(sourcePool, `runtime weighted item ${itemId} must exist`);
    const sourceGroup = sourcePool.rollGroupId?.trim();
    const coalescedEntries = table.pools
        .filter(
            (pool) =>
                pool.kind === "weighted" &&
                pool.rolls === sourcePool.rolls &&
                (sourceGroup
                    ? pool.rollGroupId?.trim() === sourceGroup
                    : pool === sourcePool),
        )
        .flatMap((pool) => pool.entries);
    const outcomes = new Map<string, { itemIds: number[]; weight: number }>();
    coalescedEntries.forEach((entry, index) => {
        const key = entry.outcomeId ? `bundle:${entry.outcomeId}` : `entry:${index}`;
        const outcome = outcomes.get(key) ?? { itemIds: [], weight: 0 };
        outcome.itemIds.push(entry.itemId);
        outcome.weight = Math.max(outcome.weight, entry.probability ?? 0);
        outcomes.set(key, outcome);
    });
    const orderedOutcomes = [...outcomes.values()];
    const outcomeTotal = orderedOutcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    const nothingProbability = Math.max(0, 1 - outcomeTotal);
    const targetIndex = orderedOutcomes.findIndex((outcome) => outcome.itemIds.includes(itemId));
    assert.notEqual(targetIndex, -1, `runtime weighted outcome ${itemId} must exist`);
    const precedingWeight = orderedOutcomes
        .slice(0, targetIndex)
        .reduce((sum, outcome) => sum + outcome.weight, 0);
    const target = orderedOutcomes[targetIndex];
    const total = nothingProbability + outcomeTotal;
    return (nothingProbability + precedingWeight + target.weight / 2) / total;
}

function rollKrilOutcome(itemId: number) {
    const originalRandom = Math.random;
    Math.random = () => randomForWeightedOutcome(canonicalKrilTable, itemId);
    try {
        return new DropRollService(registry).roll({
            npcTypeId: 3129,
            npcName: "K'ril Tsutsaroth",
            tile: { x: 2925, y: 5322, level: 2 },
            isWilderness: false,
            recipients: [{ ownerId: 1, dropRateMultiplier: 1 }],
        });
    } finally {
        Math.random = originalRandom;
    }
}

const attackStrengthPotionDrop = rollKrilOutcome(145);
assert.equal(attackStrengthPotionDrop.filter((drop) => drop.itemId === 145).length, 1);
assert.equal(attackStrengthPotionDrop.filter((drop) => drop.itemId === 157).length, 1);
assert.equal(
    attackStrengthPotionDrop.some((drop) => drop.itemId === 26362),
    false,
    "K'ril's runtime roll must never award the unsupported conditional Frozen Door key piece",
);

const restoreBrewPotionDrop = rollKrilOutcome(3026);
assert.equal(restoreBrewPotionDrop.filter((drop) => drop.itemId === 3026).length, 1);
assert.equal(restoreBrewPotionDrop.filter((drop) => drop.itemId === 189).length, 1);

const notedLantadymeDrop = rollKrilOutcome(2486);
assert.equal(
    notedLantadymeDrop.some((drop) => drop.itemId === 2486 && drop.quantity === 10),
    true,
    "K'ril's noted grimy lantadyme must resolve to the cache's noted item ID",
);

const coinDrop = rollKrilOutcome(995).find((drop) => drop.itemId === 995);
assert(coinDrop, "K'ril's runtime main table must award canonical ID 995 coins");
assert(coinDrop.quantity >= 19_500 && coinDrop.quantity <= 20_000);

assert.equal(
    registry.describe(6495).source,
    "none",
    "the no-reward PvM Arena K'ril form must ignore its stale generic Wiki checkpoint",
);
assert.equal(registry.get(6495), undefined);
assert.deepEqual(
    new DropRollService(registry).roll({
        npcTypeId: 6495,
        npcName: "K'ril Tsutsaroth",
        tile: { x: 3328, y: 3200, level: 0 },
        isWilderness: false,
        recipients: [{ ownerId: 1, dropRateMultiplier: 1 }],
    }),
    [],
    "the PvM Arena form must stay fail-closed through the live roll service",
);

console.log("NPC drop snapshot integrity tests passed");
