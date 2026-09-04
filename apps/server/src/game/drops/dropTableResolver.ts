import { getItemDefinition, loadItemDefinitions } from "@server/data/items";
import type {
    DropConditionDefinition,
    DropQuantity,
    NpcDropEntry,
    NpcDropEntryDefinition,
    NpcDropPool,
    NpcDropPoolDefinition,
    NpcDropTable,
    NpcDropTableDefinition,
    ProbabilityInput,
    QuantityInput,
} from "@server/game/drops/types";

const ITEM_NAME_ALIASES = new Map<string, string>([["coins", "Coins"]]);

/**
 * Explicit name→ID overrides for items whose canonical name collides with
 * non-stackable quest variants (e.g. "Coins" = 617 vs 995).
 */
const ITEM_NAME_ID_OVERRIDES = new Map<string, number>([["coins", 995]]);

/**
 * Cache IDs that look like ordinary items but must never enter the live drop
 * pipeline. ID 617 is an unstackable/interface Coins variant; every economy
 * check and every real coin pile uses the canonical stackable item (995).
 *
 * Keeping this guard at the runtime boundary makes old snapshots and manual
 * definitions safe while the source-data audit prevents new bad IDs.
 */
const CANONICAL_DROP_ITEM_IDS = new Map<number, number>([[617, 995]]);

let cachedItemIdsByName: Map<string, number> | undefined;

function getItemIdsByName(): Map<string, number> {
    if (!cachedItemIdsByName) {
        cachedItemIdsByName = new Map<string, number>();
        for (const item of loadItemDefinitions()) {
            const normalized = normalizeName(item.name);
            if (!normalized || cachedItemIdsByName.has(normalized)) continue;
            cachedItemIdsByName.set(normalized, item.id);
        }
    }
    return cachedItemIdsByName;
}

export function normalizeName(value: string | undefined | null): string {
    const trimmed = String(value ?? "")
        .replace(/<!--.*?-->/g, "")
        .replace(/\[\[|\]\]/g, "")
        .trim()
        .toLowerCase();
    if (!trimmed) return "";
    return trimmed.replace(/\s+/g, " ");
}

export function resolveItemId(def: NpcDropEntryDefinition): number | undefined {
    if (def.itemId !== undefined && def.itemId > 0) {
        return CANONICAL_DROP_ITEM_IDS.get(def.itemId) ?? def.itemId;
    }
    const rawName = String(def.itemName ?? "").trim();
    if (!rawName) return undefined;
    const normalized = normalizeName(rawName);
    // Check explicit ID overrides first (handles ambiguous names like "Coins")
    const overrideId = ITEM_NAME_ID_OVERRIDES.get(normalized);
    if (overrideId !== undefined) return overrideId;
    const aliasName = ITEM_NAME_ALIASES.get(normalized) ?? rawName;
    return getItemIdsByName().get(normalizeName(aliasName));
}

export function parseQuantity(input: QuantityInput | undefined): DropQuantity {
    if (Array.isArray(input)) {
        const min = Math.max(1, input[0]);
        const max = Math.max(min, input[1]);
        return { min, max };
    }
    if (Number.isFinite(input as number)) {
        const quantity = Math.max(1, Math.floor(input as number));
        return { min: quantity, max: quantity };
    }
    const raw = String(input ?? "1")
        .replace(/<!--.*?-->/g, "")
        .replace(/\(.*?\)/g, "")
        .replace(/,/g, "")
        .replace(/[\u2013\u2014]/g, "-")
        .trim();
    const rangeMatch = raw.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
        const min = Math.max(1, parseInt(rangeMatch[1], 10));
        const max = Math.max(min, parseInt(rangeMatch[2], 10));
        return { min, max };
    }
    const valueMatch = raw.match(/^(\d+)$/);
    if (valueMatch) {
        const quantity = Math.max(1, parseInt(valueMatch[1], 10));
        return { min: quantity, max: quantity };
    }
    return { min: 1, max: 1 };
}

export function parseProbability(input: ProbabilityInput | undefined): number | undefined {
    if (input === undefined) return undefined;
    if (Number.isFinite(input as number)) {
        const value = input as number;
        if (value < 0) return undefined;
        return Math.max(0, value);
    }
    const raw = String(input)
        .replace(/<!--.*?-->/g, "")
        .replace(/,/g, "")
        .trim()
        .toLowerCase();
    if (!raw) return undefined;
    if (raw === "always") return 1;
    const fraction = raw.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
    if (fraction) {
        const numerator = parseFloat(fraction[1]);
        const denominator = parseFloat(fraction[2]);
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
            return undefined;
        }
        return Math.max(0, numerator / denominator);
    }
    const inChance = raw.match(/^1\s+in\s+([\d.]+)$/);
    if (inChance) {
        const denominator = parseFloat(inChance[1]);
        if (!Number.isFinite(denominator) || denominator <= 0) return undefined;
        return 1 / denominator;
    }
    const direct = parseFloat(raw);
    if (!Number.isFinite(direct) || direct < 0) return undefined;
    return direct;
}

export function resolveDropCondition(
    condition: DropConditionDefinition | undefined,
): DropConditionDefinition | undefined {
    if (!condition) return undefined;
    const requiredAnyEquippedItemIds = (condition.requiredAnyEquippedItemIds ?? [])
        .map((itemId) => itemId)
        .filter((itemId) => itemId > 0);
    const minimumQuestPoints =
        condition.minimumQuestPoints !== undefined
            ? Math.max(0, condition.minimumQuestPoints)
            : undefined;
    const hasCondition =
        condition.wildernessOnly === true ||
        condition.recipientWildernessOnly === true ||
        condition.wildernessGodWarsDungeonOnly === true ||
        condition.slayerTaskOnly === true ||
        Boolean(condition.requiredSlayerMaster?.trim()) ||
        minimumQuestPoints !== undefined ||
        requiredAnyEquippedItemIds.length > 0;
    if (!hasCondition) return undefined;
    return {
        wildernessOnly: condition.wildernessOnly === true,
        recipientWildernessOnly: condition.recipientWildernessOnly === true,
        wildernessGodWarsDungeonOnly: condition.wildernessGodWarsDungeonOnly === true,
        slayerTaskOnly: condition.slayerTaskOnly === true,
        requiredSlayerMaster: condition.requiredSlayerMaster?.trim() || undefined,
        minimumQuestPoints,
        requiredAnyEquippedItemIds:
            requiredAnyEquippedItemIds.length > 0 ? requiredAnyEquippedItemIds : undefined,
    };
}

export function resolveDropEntry(def: NpcDropEntryDefinition): NpcDropEntry | undefined {
    const baseItemId = resolveItemId(def);
    if (!(baseItemId && baseItemId > 0)) return undefined;
    const quantityRequestsNote =
        typeof def.quantity === "string" && /\(\s*noted\s*\)/i.test(def.quantity);
    let itemId = baseItemId;
    if (quantityRequestsNote) {
        const base = getItemDefinition(baseItemId);
        const note = base && base.noteId > 0 ? getItemDefinition(base.noteId) : undefined;
        // Cache links are bidirectional for some item families, so validate
        // both the note flag and visible name before changing the drop id.
        if (note?.noted === true && normalizeName(note.name) === normalizeName(base?.name)) {
            itemId = note.id;
        }
    }
    return {
        itemId,
        quantity: parseQuantity(def.quantity),
        probability: parseProbability(def.rarity),
        altProbability: parseProbability(def.altRarity),
        // Mandatory item restrictions apply to every source, including legacy imports.
        condition: itemId === 11941
            ? { ...resolveDropCondition(def.condition), wildernessOnly: true }
            : resolveDropCondition(def.condition),
        altCondition: resolveDropCondition(def.altCondition),
        dropBoostEligible: def.dropBoostEligible === true,
        outcomeId:
            typeof def.outcomeId === "string" && def.outcomeId.trim()
                ? def.outcomeId.trim()
                : undefined,
    };
}

function sumOutcomeProbabilities(entries: readonly NpcDropEntry[]): number {
    const outcomes = new Map<string, number>();
    entries.forEach((entry, index) => {
        const key = entry.outcomeId ? `bundle:${entry.outcomeId}` : `entry:${index}`;
        outcomes.set(key, Math.max(outcomes.get(key) ?? 0, entry.probability ?? 0));
    });
    return [...outcomes.values()].reduce((sum, probability) => sum + probability, 0);
}

export function resolveDropPool(def: NpcDropPoolDefinition): NpcDropPool | undefined {
    const entries = def.entries
        .map((entry) => resolveDropEntry(entry))
        .filter((entry): entry is NpcDropEntry => entry !== undefined);
    if (entries.length === 0) return undefined;
    const normalizedEntries = entries
        .map((entry) => ({
            ...entry,
            probability: Math.max(0, Math.min(1, entry.probability ?? 0)),
            altProbability:
                entry.altProbability === undefined
                    ? undefined
                    : Math.max(0, Math.min(1, entry.altProbability)),
        }))
        .filter(
            (entry) =>
                (entry.probability ?? 0) > 0 || (entry.altProbability ?? 0) > 0,
        );
    if (normalizedEntries.length === 0) return undefined;
    // A paired/bundled Wiki outcome (for example K'ril's super attack and
    // super strength potions) occupies one table slot even though every item
    // has the same displayed marginal rarity.
    const totalProbability = sumOutcomeProbabilities(normalizedEntries);
    return {
        kind: def.kind,
        category: def.category,
        rollGroupId:
            typeof def.rollGroupId === "string" && def.rollGroupId.trim()
                ? def.rollGroupId.trim()
                : undefined,
        rollChainId:
            typeof def.rollChainId === "string" && def.rollChainId.trim()
                ? def.rollChainId.trim()
                : undefined,
        rollChainOrder:
            typeof def.rollChainOrder === "number" &&
            Number.isInteger(def.rollChainOrder) &&
            def.rollChainOrder >= 0
                ? def.rollChainOrder
                : undefined,
        rolls: Math.max(1, def.rolls ?? 1),
        // Preserve the Wiki's literal marginal weights. The roll service
        // computes the active table per recipient and normalizes only when
        // that specific base/alternate/conditional context is overfull.
        // Static normalization cannot be correct when alternate conditions
        // change only part of a loaded table, and independent pools may
        // legitimately contain several guaranteed rolls.
        entries: normalizedEntries,
        nothingProbability: Math.max(0, 1 - Math.min(1, totalProbability)),
    };
}

export function resolveDropTable(def: NpcDropTableDefinition): NpcDropTable | undefined {
    const always = (def.always ?? [])
        .map((entry) => resolveDropEntry(entry))
        .filter((entry): entry is NpcDropEntry => entry !== undefined);
    const pools = (def.pools ?? [])
        .map((pool) => resolveDropPool(pool))
        .filter((pool): pool is NpcDropPool => pool !== undefined);
    if (always.length === 0 && pools.length === 0) return undefined;
    return { always, pools };
}
