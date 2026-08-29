import fs from "fs";

import { getItemDefinition } from "@server/data/items";
import type {
    ImportedMonsterDefinition,
    NpcDropEntryDefinition,
    NpcDropTableDefinition,
} from "@server/game/drops/types";
import { referencePath } from "@server/paths";

type RawMonsterDrop = {
    id?: number;
    name?: string;
    quantity?: string;
    rarity?: number;
    rolls?: number;
};

type RawMonsterEntry = {
    id?: number;
    name?: string;
    combat_level?: number;
    duplicate?: boolean;
    incomplete?: boolean;
    drops?: RawMonsterDrop[];
};

type WikiDropSnapshot = {
    format?: string;
    records?: Array<{
        npcTypeId?: number;
        name?: string;
        source?: "wiki";
        incomplete?: boolean;
        table?: ImportedMonsterDefinition["table"];
    }>;
};

function resolveWikiDropSnapshotPath(): string {
    return referencePath("npc-drops-wiki.json");
}

function resolveMonstersCompletePath(): string {
    return referencePath("monsters-complete.json");
}

let cachedEntries: ImportedMonsterDefinition[] | undefined;
let sourceStatus:
    | { path: string; entryCount: number; error?: undefined }
    | { path: string; entryCount: 0; error: string }
    | undefined;

/**
 * The bootstrap JSON flattens the Wiki's labelled subtables. These names are
 * universally independent rolls in OSRS, so restoring them prevents a pet or
 * clue chance from consuming the NPC's normal main-drop roll.  Less certain
 * entries intentionally remain in the main pool instead of being guessed.
 */
function isKnownTertiaryDrop(drop: RawMonsterDrop): boolean {
    const name = String(drop.name ?? "")
        .replace(/<!--.*?-->/g, "")
        .trim()
        .toLowerCase();
    return (
        name.startsWith("clue scroll") ||
        name.startsWith("pet ") ||
        name === "giant key" ||
        name === "mossy key" ||
        name === "ecumenical key" ||
        name === "larran's key" ||
        name === "brimstone key" ||
        name === "long bone" ||
        name === "curved bone" ||
        name.includes("champion scroll") ||
        name.startsWith("ensouled ") ||
        name.startsWith("ancient shard") ||
        name.startsWith("dark totem") ||
        name.startsWith("skotizo totem")
    );
}

function shouldSkipDrop(drop: RawMonsterDrop): boolean {
    const name = (drop.name ?? "")
        .replace(/<!--.*?-->/g, "")
        .trim()
        .toLowerCase();
    if (!name) return true;
    // Keep cache-backed clue, key, jar, pet, and casket entries. The source
    // does not give us a reliable category for every special drop, but
    // omitting them would make the displayed table (and actual rolls) less
    // complete than the game's drop table.
    const itemId = drop.id ?? -1;
    return !getItemDefinition(itemId);
}

function toEntry(drop: RawMonsterDrop): NpcDropEntryDefinition | undefined {
    if (shouldSkipDrop(drop)) return undefined;
    return {
        itemId: drop.id ?? -1,
        quantity: drop.quantity ?? "1",
        // `rolls` is the source table's roll count, not a probability
        // multiplier. Multiplying it made a 31% drop with three rolls appear
        // as a 94% (1/1) drop. Legacy records retain their per-roll rate;
        // current Wiki imports preserve a shared pool roll count explicitly.
        rarity: drop.rarity ?? 0,
    };
}

function normalizeRawMonster(raw: RawMonsterEntry): ImportedMonsterDefinition | undefined {
    const converted = (raw.drops ?? [])
        .map((drop) => ({ drop, entry: toEntry(drop) }))
        .filter(
            (value): value is { drop: RawMonsterDrop; entry: NpcDropEntryDefinition } =>
                value.entry !== undefined,
        );
    if (converted.length === 0) return undefined;
    const hasNumericRarity = (
        entry: NpcDropEntryDefinition,
    ): entry is NpcDropEntryDefinition & { rarity: number } => typeof entry.rarity === "number";
    const always = converted
        .map(({ entry }) => entry)
        .filter((entry) => hasNumericRarity(entry) && entry.rarity >= 1);
    const tertiary = converted
        .filter(({ drop, entry }) =>
            hasNumericRarity(entry) && entry.rarity > 0 && entry.rarity < 1 && isKnownTertiaryDrop(drop),
        )
        .map(({ entry }) => entry);
    const main = converted
        .filter(({ drop, entry }) =>
            hasNumericRarity(entry) &&
            entry.rarity > 0 &&
            entry.rarity < 1 &&
            !isKnownTertiaryDrop(drop),
        )
        .map(({ entry }) => entry);
    const pools = [] as NonNullable<ImportedMonsterDefinition["table"]["pools"]>;
    if (main.length > 0) {
        pools.push({ kind: "weighted", category: "main", entries: main });
    }
    if (tertiary.length > 0) {
        pools.push({ kind: "independent", category: "tertiary", entries: tertiary });
    }
    return {
        npcTypeId:
            typeof raw.id === "number" && Number.isInteger(raw.id) && raw.id >= 0
                ? raw.id
                : undefined,
        name: (raw.name ?? "").trim(),
        combatLevel: raw.combat_level,
        duplicate: raw.duplicate === true,
        incomplete: raw.incomplete === true,
        source: "legacy",
        table: {
            always,
            pools: pools.length > 0 ? pools : undefined,
        },
    };
}

/**
 * Prefer complete data before partial data while retaining the current Wiki
 * source as the tie-breaker. A complete exact-ID legacy table is safer than a
 * Wiki fallback known to have omitted rows; live cache-name validation still
 * prevents a stale legacy ID from attaching to a different NPC.
 */
export function prioritizeImportedDefinitions(
    wikiEntries: readonly ImportedMonsterDefinition[],
    legacyEntries: readonly ImportedMonsterDefinition[],
): ImportedMonsterDefinition[] {
    return [
        ...wikiEntries.filter((entry) => entry.incomplete !== true),
        ...legacyEntries.filter((entry) => entry.incomplete !== true),
        ...wikiEntries.filter((entry) => entry.incomplete === true),
        ...legacyEntries.filter((entry) => entry.incomplete === true),
    ];
}

function extractObjectAt(
    text: string,
    startIndex: number,
): { json: string; nextIndex: number } | undefined {
    if (text[startIndex] !== "{") return undefined;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = startIndex; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === "{") {
            depth++;
            continue;
        }
        if (ch === "}") {
            depth--;
            if (depth === 0) {
                return {
                    json: text.slice(startIndex, i + 1),
                    nextIndex: i + 1,
                };
            }
        }
    }
    return undefined;
}

function parseTopLevelEntries(text: string): RawMonsterEntry[] {
    const out: RawMonsterEntry[] = [];
    let index = text.indexOf("{");
    if (index === -1) return out;
    index++;
    while (index < text.length) {
        while (index < text.length && /[\s,]/.test(text[index])) index++;
        if (index >= text.length || text[index] !== '"') break;
        const keyEnd = text.indexOf('"', index + 1);
        if (keyEnd === -1) break;
        index = keyEnd + 1;
        while (index < text.length && /[\s:]/.test(text[index])) index++;
        const extracted = extractObjectAt(text, index);
        if (!extracted) break;
        try {
            out.push(JSON.parse(extracted.json) as RawMonsterEntry);
        } catch {
            break;
        }
        index = extracted.nextIndex;
    }
    return out;
}

function loadWikiSnapshotDefinitions(sourcePath: string): ImportedMonsterDefinition[] {
    if (!fs.existsSync(sourcePath)) return [];
    const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as WikiDropSnapshot;
    if (raw.format !== "xrsps.osrs-wiki-npc-drops.v1" || !Array.isArray(raw.records)) {
        throw new Error("unexpected Wiki snapshot format");
    }
    return raw.records
        .map((record): ImportedMonsterDefinition | undefined => {
            const npcTypeId = record.npcTypeId;
            const name = String(record.name ?? "").trim();
            if (!Number.isInteger(npcTypeId) || (npcTypeId ?? -1) < 0 || !name || !record.table) {
                return undefined;
            }
            return {
                npcTypeId,
                name,
                source: "wiki",
                incomplete: record.incomplete === true,
                table: normalizeWikiDropTable(record.table),
            };
        })
        .filter((entry): entry is ImportedMonsterDefinition => entry !== undefined);
}

/**
 * Wiki subheadings such as "Weapons and armour" and "Runes and ammunition"
 * are display categories for one normal NPC drop roll. Keeping each heading
 * as its own weighted pool would incorrectly award several regular drops in
 * one death. Expanded shared/RDT rows are also alternatives selected by that
 * same main roll; treating them as an additional pool can award two mutually
 * exclusive drops from one kill.
 */
export function normalizeWikiDropTable(
    table: NpcDropTableDefinition,
): NpcDropTableDefinition {
    return {
        always: table.always,
        pools: (table.pools ?? []).map((pool) => {
            const isExclusiveWikiPool = pool.kind === "weighted" || pool.category === "coins";
            if (!isExclusiveWikiPool) return pool;
            const rolls = Math.max(1, pool.rolls ?? 1);
            return {
                ...pool,
                // Compatibility for bucket-v2 checkpoints written before
                // outcome grouping: overflow coins were temporarily stored as
                // independent even though they are main-table alternatives.
                kind: "weighted" as const,
                rollGroupId:
                    pool.rollGroupId?.trim() || `wiki:exclusive:${rolls}`,
                rolls,
            };
        }),
    };
}

export function loadMonstersCompleteDefinitions(): ImportedMonsterDefinition[] {
    if (cachedEntries) return cachedEntries;
    const legacySourcePath = resolveMonstersCompletePath();
    const wikiSourcePath = resolveWikiDropSnapshotPath();
    let wikiEntries: ImportedMonsterDefinition[] = [];
    let legacyEntries: ImportedMonsterDefinition[] = [];
    const errors: string[] = [];
    try {
        // Current Wiki records are ordered before the legacy bootstrap source,
        // so their exact cache-NPC IDs win without a name-based heuristic.
        wikiEntries = loadWikiSnapshotDefinitions(wikiSourcePath);
    } catch (error) {
        errors.push(`Wiki snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        const rawText = fs.readFileSync(legacySourcePath, "utf8");
        legacyEntries = parseTopLevelEntries(rawText)
            .map((entry) => normalizeRawMonster(entry))
            .filter((entry): entry is ImportedMonsterDefinition => entry !== undefined);
    } catch (error) {
        errors.push(`Legacy snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
    cachedEntries = prioritizeImportedDefinitions(wikiEntries, legacyEntries);
    const sourcePath = wikiEntries.length > 0 ? `${wikiSourcePath} + ${legacySourcePath}` : legacySourcePath;
    if (cachedEntries.length === 0) {
        sourceStatus = { path: sourcePath, entryCount: 0, error: errors.join("; ") || "no drop tables found" };
        console.warn(`[drops] Full NPC drop source unavailable: ${sourceStatus.error}`);
    } else {
        sourceStatus = { path: sourcePath, entryCount: cachedEntries.length };
        if (errors.length > 0) console.warn(`[drops] ${errors.join("; ")}`);
        console.info(
            `[drops] Loaded ${wikiEntries.length} current Wiki and ${legacyEntries.length} legacy NPC drop tables.`,
        );
    }
    return cachedEntries;
}

/** Exposes the actual runtime source status for the developer drop diagnostic. */
export function getMonstersCompleteSourceStatus(): NonNullable<typeof sourceStatus> {
    loadMonstersCompleteDefinitions();
    return sourceStatus!;
}
