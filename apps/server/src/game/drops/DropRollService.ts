import type { PendingNpcDrop } from "@server/game/npcManager";
import { isInWilderness } from "@server/game/combat/MultiCombatZones";
import { NpcDropRegistry } from "@server/game/drops/NpcDropRegistry";
import { resolveDropTable } from "@server/game/drops/dropTableResolver";
import type {
    DropConditionDefinition,
    DropContext,
    DropRecipient,
    NpcDropEntry,
    NpcDropPool,
    NpcDropTable,
} from "@server/game/drops/types";

const VARP_QUEST_POINTS = 101;

// The cache's world-map intermap links identify three entrances into the six
// Revenant Cave map squares and two entrances into the four Wilderness Slayer
// Cave map squares. Both are single-floor Wilderness dungeons; exact region
// membership avoids classifying unrelated underground maps by a broad box.
const UNDERGROUND_WILDERNESS_REGIONS = new Set([
    // Revenant Caves: region X 49-50, region Y 157-159.
    12701, 12702, 12703, 12957, 12958, 12959,
    // Wilderness Slayer Cave: region X 52-53, region Y 157-158.
    13469, 13470, 13725, 13726,
]);

function isUndergroundWilderness(tile: { x: number; y: number; level: number }): boolean {
    if (tile.level !== 0) return false;
    const regionId = ((tile.x >> 6) << 8) | (tile.y >> 6);
    return UNDERGROUND_WILDERNESS_REGIONS.has(regionId);
}

function isWildernessGodWarsDungeon(
    tile: { x: number; y: number; level: number },
): boolean {
    const { x, y, level } = tile;
    const maxY = x < 3048 ? 10175 : x < 3056 ? 10151 : x < 3064 ? 10143 : 10135;
    return (
        level === 0 &&
        x >= 3008 &&
        x <= 3071 &&
        y >= 10112 &&
        y <= maxY
    );
}

function isWildernessDropArea(
    tile: { x: number; y: number; level: number },
    knownSurfaceWilderness?: boolean,
): boolean {
    return (
        knownSurfaceWilderness === true ||
        isInWilderness(tile.x, tile.y) ||
        isUndergroundWilderness(tile) ||
        isWildernessGodWarsDungeon(tile)
    );
}

function rollQuantity(entry: NpcDropEntry): number {
    const min = Math.max(1, entry.quantity.min);
    const max = Math.max(min, entry.quantity.max);
    if (min === max) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
}

function applyDropRateMultiplier(
    probability: number,
    multiplier: number,
    eligible: boolean,
): number {
    if (!eligible || multiplier <= 1) return probability;
    return Math.max(0, Math.min(1, probability * multiplier));
}

function matchesCondition(
    condition: DropConditionDefinition | undefined,
    context: DropContext,
    recipient: DropRecipient,
): boolean {
    if (!condition) return true;
    const inWildernessGodWarsDungeon = isWildernessGodWarsDungeon(context.tile);
    const monsterInWilderness = isWildernessDropArea(context.tile, context.isWilderness);
    if (condition.wildernessOnly && !monsterInWilderness) return false;
    if (
        condition.recipientWildernessOnly &&
        (!recipient.tile || !isWildernessDropArea(recipient.tile))
    ) {
        return false;
    }
    if (condition.wildernessGodWarsDungeonOnly) {
        if (!inWildernessGodWarsDungeon) return false;
    }
    const slayerTask = recipient.player?.combat.slayerTask;
    if (condition.slayerTaskOnly) {
        const task = recipient.player?.skillSystem.getSlayerTaskInfo(slayerTask);
        if (!task?.onTask) return false;
        // `onTask` may be explicitly target-aware. If only a generic active
        // assignment is present, require its stored name/species to match the
        // NPC instead of granting task-only rewards for every kill.
        if (slayerTask?.onTask !== true) {
            const assignedTargets = [slayerTask?.monsterName, ...(slayerTask?.monsterSpecies ?? [])]
                .map((value) => String(value ?? "").trim().toLowerCase())
                .filter(Boolean);
            const npcName = context.npcName.trim().toLowerCase();
            if (assignedTargets.length === 0 || !assignedTargets.includes(npcName)) {
                return false;
            }
        }
    }
    if (condition.requiredSlayerMaster) {
        const actualMaster = String(slayerTask?.slayerMaster ?? slayerTask?.masterName ?? "")
            .trim()
            .toLowerCase();
        const requiredMaster = condition.requiredSlayerMaster.trim().toLowerCase();
        const masterMatches =
            actualMaster === requiredMaster ||
            requiredMaster.startsWith(`${actualMaster} `) ||
            actualMaster.startsWith(`${requiredMaster} `);
        if (!actualMaster || !masterMatches) return false;
    }
    if (condition.minimumQuestPoints !== undefined) {
        const questPoints = recipient.player?.varps.getVarpValue(VARP_QUEST_POINTS) ?? 0;
        if (questPoints < condition.minimumQuestPoints) return false;
    }
    const requiredAnyEquippedItemIds = condition.requiredAnyEquippedItemIds ?? [];
    if (requiredAnyEquippedItemIds.length > 0) {
        const equipment = recipient.player?.exportEquipmentSnapshot() ?? [];
        const hasRequiredItem = equipment.some((entry) =>
            requiredAnyEquippedItemIds.includes(entry.itemId),
        );
        if (!hasRequiredItem) return false;
    }
    return true;
}

function resolveEntryProbability(
    entry: NpcDropEntry,
    context: DropContext,
    recipient: DropRecipient,
): number {
    if (
        context.canReceiveItem &&
        !context.canReceiveItem(context.npcTypeId, entry.itemId, recipient)
    ) {
        return 0;
    }
    if (!matchesCondition(entry.condition, context, recipient)) return 0;
    const probability =
        entry.altProbability !== undefined &&
        matchesCondition(entry.altCondition, context, recipient)
            ? entry.altProbability
            : (entry.probability ?? 0);
    return applyDropRateMultiplier(
        probability,
        recipient.dropRateMultiplier,
        entry.dropBoostEligible,
    );
}

type ResolvedOutcome = {
    entries: NpcDropEntry[];
    weight: number;
};

function resolveOutcomes(
    pool: NpcDropPool,
    context: DropContext,
    recipient: DropRecipient,
): ResolvedOutcome[] {
    const grouped = new Map<string, NpcDropEntry[]>();
    pool.entries.forEach((entry, index) => {
        const key = entry.outcomeId ? `bundle:${entry.outcomeId}` : `entry:${index}`;
        const entries = grouped.get(key) ?? [];
        entries.push(entry);
        grouped.set(key, entries);
    });
    return [...grouped.values()].map((entries) => {
        const eligible = entries
            .map((entry) => ({ entry, chance: resolveEntryProbability(entry, context, recipient) }))
            .filter(({ chance }) => chance > 0);
        return {
            entries: eligible.map(({ entry }) => entry),
            // Bundled rows describe one outcome. Their marginal rarities are
            // equal; max also keeps the outcome alive if one conditional item
            // in the bundle is unavailable to this recipient.
            weight: eligible.reduce((maximum, { chance }) => Math.max(maximum, chance), 0),
        };
    });
}

function pickWeightedOutcome(
    pool: NpcDropPool,
    context: DropContext,
    recipient: DropRecipient,
): NpcDropEntry[] | undefined {
    const outcomes = resolveOutcomes(pool, context, recipient);
    const outcomeTotal = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    // Conditions and alternate rates change the active table per recipient.
    // Recompute the empty slice so alternate probabilities stay literal
    // instead of being diluted by the base table's cached empty probability.
    const nothingProbability = Math.max(0, 1 - outcomeTotal);
    const total = nothingProbability + outcomeTotal;
    if (!(total > 0)) return undefined;
    let roll = Math.random() * total;
    if (roll < nothingProbability) return undefined;
    roll -= nothingProbability;
    for (const outcome of outcomes) {
        roll -= outcome.weight;
        if (roll <= 0) return outcome.entries;
    }
    return undefined;
}

function rollIndependentPool(
    pool: NpcDropPool,
    context: DropContext,
    recipient: DropRecipient,
): Array<{ itemId: number; quantity: number }> {
    const out: Array<{ itemId: number; quantity: number }> = [];
    for (let roll = 0; roll < pool.rolls; roll++) {
        for (const outcome of resolveOutcomes(pool, context, recipient)) {
            if (outcome.weight <= 0 || Math.random() >= outcome.weight) continue;
            for (const entry of outcome.entries) {
                out.push({ itemId: entry.itemId, quantity: rollQuantity(entry) });
            }
        }
    }
    return out;
}

function rollWeightedPool(
    pool: NpcDropPool,
    context: DropContext,
    recipient: DropRecipient,
): Array<{ itemId: number; quantity: number }> {
    const out: Array<{ itemId: number; quantity: number }> = [];
    for (let roll = 0; roll < pool.rolls; roll++) {
        const entries = pickWeightedOutcome(pool, context, recipient);
        if (!entries) continue;
        for (const entry of entries) {
            out.push({ itemId: entry.itemId, quantity: rollQuantity(entry) });
        }
    }
    return out;
}

function rollWeightedChain(
    stages: readonly NpcDropPool[],
    context: DropContext,
    recipient: DropRecipient,
): Array<{ itemId: number; quantity: number }> {
    const out: Array<{ itemId: number; quantity: number }> = [];
    if (stages.length === 0) return out;
    const ordered = stages
        .map((stage, sourceOrder) => ({ stage, sourceOrder }))
        .sort(
            (left, right) =>
                (left.stage.rollChainOrder ?? Number.MAX_SAFE_INTEGER) -
                    (right.stage.rollChainOrder ?? Number.MAX_SAFE_INTEGER) ||
                left.sourceOrder - right.sourceOrder,
        )
        .map(({ stage }) => stage);
    // Every stage in a chain has the same roll count (the chain lookup key
    // includes it). Execute the whole ordered chain once per cycle so a
    // superior monster's three rolls do not globally short-circuit each other.
    for (let roll = 0; roll < ordered[0].rolls; roll++) {
        for (const stage of ordered) {
            const entries = pickWeightedOutcome(stage, context, recipient);
            if (!entries) continue;
            for (const entry of entries) {
                out.push({ itemId: entry.itemId, quantity: rollQuantity(entry) });
            }
            break;
        }
    }
    return out;
}

function coalesceWeightedRollGroups(pools: readonly NpcDropPool[]): NpcDropPool[] {
    const resolved: NpcDropPool[] = [];
    const grouped = new Map<string, NpcDropPool>();
    for (const pool of pools) {
        const rollGroupId = pool.rollGroupId?.trim();
        if (pool.kind !== "weighted" || !rollGroupId) {
            resolved.push(pool);
            continue;
        }
        // A group with a different roll count is a distinct table cycle even
        // if a malformed/manual definition reuses the same label.
        const key = JSON.stringify([
            rollGroupId,
            pool.rolls,
            pool.rollChainId?.trim() ?? "",
            pool.rollChainOrder ?? -1,
        ]);
        const existing = grouped.get(key);
        if (existing) {
            existing.entries.push(...pool.entries);
            continue;
        }
        const combined: NpcDropPool = {
            ...pool,
            rollGroupId,
            entries: [...pool.entries],
            // Weighted rolling derives the active empty slice after recipient
            // conditions and alternate rates are known.
            nothingProbability: 0,
        };
        grouped.set(key, combined);
        resolved.push(combined);
    }
    return resolved;
}

function toPendingDrop(
    context: DropContext,
    recipient: DropRecipient,
    itemId: number,
    quantity: number,
): PendingNpcDrop {
    const resolvedItemId = context.transformItemId
        ? context.transformItemId(context.npcTypeId, itemId, recipient)
        : itemId;
    return {
        itemId: resolvedItemId,
        quantity: quantity,
        tile: { ...context.tile },
        ownerId: recipient.ownerId,
        isMonsterDrop: true,
        isWilderness: context.isWilderness,
        worldViewId: context.worldViewId,
    };
}

export class DropRollService {
    constructor(private readonly registry: NpcDropRegistry) {}

    roll(context: DropContext): PendingNpcDrop[] {
        const table =
            (context.tableOverride ? resolveDropTable(context.tableOverride) : undefined) ??
            this.registry.get(context.npcTypeId);
        if (!table) return [];
        const out: PendingNpcDrop[] = [];
        const recipients =
            context.recipients.length > 0 ? context.recipients : [{ dropRateMultiplier: 1 }];
        for (const recipient of recipients) {
            this.rollForRecipient(table, context, recipient, out);
        }
        return out;
    }

    private rollForRecipient(
        table: NpcDropTable,
        context: DropContext,
        recipient: DropRecipient,
        out: PendingNpcDrop[],
    ): void {
        for (const entry of table.always) {
            if (
                context.canReceiveItem &&
                !context.canReceiveItem(context.npcTypeId, entry.itemId, recipient)
            ) {
                continue;
            }
            if (!matchesCondition(entry.condition, context, recipient)) continue;
            out.push(toPendingDrop(context, recipient, entry.itemId, rollQuantity(entry)));
        }
        const resolvedPools = coalesceWeightedRollGroups(table.pools);
        const completedChains = new Set<string>();
        for (const pool of resolvedPools) {
            const rollChainId = pool.kind === "weighted" ? pool.rollChainId?.trim() : undefined;
            if (rollChainId) {
                const chainKey = JSON.stringify([rollChainId, pool.rolls]);
                if (completedChains.has(chainKey)) continue;
                completedChains.add(chainKey);
                const rolled = rollWeightedChain(
                    resolvedPools.filter(
                        (candidate) =>
                            candidate.kind === "weighted" &&
                            candidate.rolls === pool.rolls &&
                            candidate.rollChainId?.trim() === rollChainId,
                    ),
                    context,
                    recipient,
                );
                for (const drop of rolled) {
                    out.push(toPendingDrop(context, recipient, drop.itemId, drop.quantity));
                }
                continue;
            }
            const rolled = pool.kind === "independent"
                ? rollIndependentPool(pool, context, recipient)
                : rollWeightedPool(pool, context, recipient);
            for (const drop of rolled) {
                out.push(toPendingDrop(context, recipient, drop.itemId, drop.quantity));
            }
        }
    }
}
