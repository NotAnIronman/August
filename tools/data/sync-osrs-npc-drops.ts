/**
 * Refreshes cache-NPC drop tables from the OSRS Wiki's structured DropsLine data.
 *
 * The legacy OSRSBox export is retained as a bootstrap fallback, but it ends
 * at an old cache revision.  This importer writes exact cache NPC IDs into a
 * checkpointed snapshot so current NPCs never depend on a name-only join.
 * Bucket rows preserve exact item metadata, noted quantities, versions, shared
 * rare-table entries, and tertiary rolls. Source wikitext is a fallback only.
 *
 * Usage:
 *   pnpm --filter @august/server sync-npc-drops                 # refresh every spawned NPC
 *   pnpm --filter @august/server sync-npc-drops -- --npc 2215   # refresh one NPC
 *   pnpm --filter @august/server sync-npc-drops -- --all
 *   pnpm --filter @august/server sync-npc-drops -- --all --missing
 *   pnpm --filter @august/server ensure-npc-drops
 */
import fs from "fs";
import * as http from "node:http";
import path from "path";
import { fileURLToPath } from "url";
import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheInfos } from "@tools/cache/client/load-util";
import {
    referencePath,
    serverAppPath,
    serverGeneratedDataPath,
} from "@tools/lib/repository-paths";

const ITEMS_PATH = serverGeneratedDataPath("items.json");
const NPCS_PATH = serverGeneratedDataPath("npcs.json");
const NPC_AGGRESSION_PATH = serverGeneratedDataPath("npc-aggression.json");
const SPAWNS_PATH = serverGeneratedDataPath("npc-spawns.json");
const DESTINATION = referencePath("npc-drops-wiki.json");
const TARGET_PATH = serverAppPath("target.txt");
const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const CONCURRENCY = 2;
const IMPORT_VERSION = "bucket-v3";
const WIKITEXT_FALLBACK_VERSION = "wikitext-v1";
const IMPORTER_USAGE =
    "Usage: sync-npc-drops [--npc id] [--all] [--missing] [--if-missing] " +
    "[--retry-importable] [--migrate-snapshot]";

// Built-in environment-proxy support was backported only in Node 22.21. Keep
// the package runnable at its declared 22.16 floor, while still enabling the
// user's authorized HTTP(S)_PROXY settings on newer runtimes when available.
const proxyCapableHttp = http as typeof http & {
    setGlobalProxyFromEnv?: () => () => void;
};
if (
    typeof proxyCapableHttp.setGlobalProxyFromEnv === "function" &&
    (process.env.HTTP_PROXY || process.env.http_proxy ||
        process.env.HTTPS_PROXY || process.env.https_proxy)
) {
    proxyCapableHttp.setGlobalProxyFromEnv();
}
// Names that changed on the Wiki while their cache object name remains the
// established in-client spelling. Keep this list explicit and reviewable;
// never fall back to fuzzy matching for drop items.
const ITEM_NAME_ALIASES = new Map<string, string>([
    ["rune javelin tips", "rune javelin heads"],
    ["dragon javelin tips", "dragon javelin heads"],
]);
const ITEM_NAME_ID_OVERRIDES = new Map<string, number>([
    ["coins", 995],
    // Current Wiki display names for cache items whose target revision keeps
    // a generic or older name. IDs are explicit to avoid ambiguous lowest-ID
    // matching (map pieces, bone variants, and champion scrolls all collide).
    ["map part (lozar)", 1536],
    ["medium ninja monkey bones", 3180],
    ["vampyre dust", 3325],
    ["giant champion scroll", 6800],
    ["dragonstone bolt tips", 9193],
    ["dragonstone bolts (e)", 21948],
    ["temple key (desert treasure ii)", 28389],
]);
// These four quest items are only available while The Frozen Door miniquest
// is active. The generic drop pipeline does not own that miniquest's start
// stage, so importing the Wiki's visually "Always" rows would award a piece
// on every kill. Omit them until the quest supplies an authoritative gate.
const FROZEN_KEY_PIECE_ITEM_IDS = new Set([
    26358, 26359, // Armadyl cache variants
    26360, 26361, // Bandos cache variants
    26362, 26363, // Zamorak cache variants
    26364, 26365, // Saradomin cache variants
]);
const FROZEN_KEY_PIECE_WARNING =
    "conditional frozen key piece omitted until The Frozen Door miniquest state is available";
function isSafeConditionalQuestOmission(message: string): boolean {
    return message.includes(FROZEN_KEY_PIECE_WARNING);
}
const RING_OF_WEALTH_RARE_TABLE_ITEMS = new Set([
    "uncut sapphire",
    "uncut emerald",
    "uncut ruby",
    "uncut diamond",
    "chaos talisman",
    "nature talisman",
    "rune javelin",
    "loop half of key",
    "tooth half of key",
    "rune spear",
    "shield left half",
    "dragon spear",
]);

type Spawn = { id?: number; name?: string };
type ExportedNpc = { id?: number; name?: string; actions?: Array<string | null> };
export type NpcTarget = { id: number; name: string; combatLevel?: number };
type LocalItem = { id: number; name?: string; noted?: boolean };
type DropCondition = {
    wildernessOnly?: boolean;
    recipientWildernessOnly?: boolean;
    wildernessGodWarsDungeonOnly?: boolean;
    slayerTaskOnly?: boolean;
    requiredSlayerMaster?: string;
    requiredAnyEquippedItemIds?: number[];
};
type DropEntry = {
    itemId: number;
    quantity: string;
    rarity: string;
    altRarity?: string;
    condition?: DropCondition;
    altCondition?: DropCondition;
    outcomeId?: string;
};
type DropPool = {
    kind: "weighted" | "independent";
    category:
        | "main"
        | "pre_roll"
        | "unique"
        | "secondary"
        | "tertiary"
        | "shared"
        | "weapons_armour"
        | "runes_ammo"
        | "coins"
        | "other";
    rollGroupId?: string;
    rollChainId?: string;
    rollChainOrder?: number;
    rolls?: number;
    entries: DropEntry[];
};
type ImportedTable = { always?: DropEntry[]; pools?: DropPool[] };
export type SnapshotRecord = {
    npcTypeId: number;
    name: string;
    source: "wiki";
    sourcePage: string;
    importer?: string;
    /** The table has usable cache-backed rows, but the Wiki page also had rows
     * that need a later item-alias or special-table pass. */
    incomplete?: boolean;
    /** Safe rows intentionally omitted because runtime eligibility state is not yet authoritative. */
    omittedConditionalQuestRows?: number;
    warnings?: string[];
    table: ImportedTable;
};
type SnapshotFailure = { npcTypeId: number; name: string; message: string };
type Snapshot = {
    format: "xrsps.osrs-wiki-npc-drops.v1";
    generatedAt: string;
    source: string;
    records: SnapshotRecord[];
    failures: SnapshotFailure[];
};

type CheckpointSelection = {
    record: SnapshotRecord;
    rejectedCandidateReason?: string;
};
type ParsedWikiResponse = { parse?: { title?: string; wikitext?: { "*"?: string } } };
type ParsedRow = { itemId: number; quantity: string; rarity: string };
type ParsedWikitextRow = ParsedRow & {
    itemName: string;
    rolls: number;
    condition?: DropCondition;
    outcomeId?: string;
};
type BucketApiRow = {
    page_name_sub?: string;
    rare_drop_table?: boolean;
    drop_json?: string;
};
type BucketApiResponse = {
    bucket?: BucketApiRow[];
    error?: string | { info?: string };
};
type BucketDropJson = {
    "Name Notes"?: string;
    "Rarity Notes"?: string;
    Rarity?: string;
    "Alt Rarity"?: string;
    "Drop level"?: string | number;
    "Drop type"?: string;
    "League region"?: string;
    "Drop Quantity"?: string;
    "Dropped from"?: string;
    "Dropped item"?: string;
    "Quantity High"?: number;
    "Quantity Low"?: number;
    Rolls?: number;
};
type ParsedBucketRow = {
    pageNameSub: string;
    rareDropTable: boolean;
    drop: BucketDropJson;
};

type WikitextDropSectionProvenance = {
    heading: string;
    category: DropPool["category"];
    sectionOrder: number;
    rowOrder: number;
    rolls: number;
    rarity: string;
    wildernessRegion: boolean;
    preRollOrder?: number;
};

export type WikitextDropProvenance = {
    byItemName: ReadonlyMap<string, readonly WikitextDropSectionProvenance[]>;
    warnings: readonly string[];
};

function normalizeName(value: string): string {
    return value
        .replace(/<!--.*?-->/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&#(?:x27|39);/gi, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function decodeHtml(value: string): string {
    return value
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&#(?:x27|39);/gi, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseArguments(args: readonly string[]): {
    ids: number[];
    all: boolean;
    missing: boolean;
    ifMissing: boolean;
    retryImportable: boolean;
    migrateSnapshot: boolean;
    help: boolean;
} {
    const ids: number[] = [];
    for (let index = 0; index < args.length; index++) {
        if (args[index] !== "--npc") continue;
        const id = Number(args[index + 1]);
        if (!Number.isInteger(id) || id < 0) throw new Error("--npc requires a non-negative cache NPC ID");
        ids.push(id);
    }
    if (args.some((arg, index) => arg.startsWith("--") && !["--npc", "--all", "--missing", "--if-missing", "--retry-importable", "--migrate-snapshot", "--help"].includes(arg) && args[index - 1] !== "--npc")) {
        throw new Error(IMPORTER_USAGE);
    }
    return {
        ids: [...new Set(ids)],
        all: args.includes("--all"),
        missing: args.includes("--missing"),
        ifMissing: args.includes("--if-missing"),
        retryImportable: args.includes("--retry-importable"),
        migrateSnapshot: args.includes("--migrate-snapshot"),
        help: args.includes("--help"),
    };
}

function loadCombatLevels(): Map<number, number> {
    if (!fs.existsSync(NPC_AGGRESSION_PATH)) return new Map();
    const parsed = JSON.parse(fs.readFileSync(NPC_AGGRESSION_PATH, "utf8")) as {
        npcs?: Record<string, { combatLevel?: number }>;
    };
    const levels = new Map<number, number>();
    for (const [rawId, definition] of Object.entries(parsed.npcs ?? {})) {
        const id = Number(rawId);
        const combatLevel = Number(definition.combatLevel);
        if (!Number.isInteger(id) || id < 0 || !(combatLevel > 0)) continue;
        levels.set(id, Math.trunc(combatLevel));
    }
    return levels;
}

function loadSpawnTargets(combatLevels: ReadonlyMap<number, number>): Map<number, NpcTarget> {
    const parsed = JSON.parse(fs.readFileSync(SPAWNS_PATH, "utf8")) as Spawn[];
    if (!Array.isArray(parsed)) throw new Error("Generated NPC spawn snapshot must contain an array");
    const targets = new Map<number, NpcTarget>();
    for (const spawn of parsed) {
        const id = Number(spawn.id);
        const name = String(spawn.name ?? "").trim();
        if (!Number.isInteger(id) || id < 0 || !name || name.toLowerCase() === "null") continue;
        if (!targets.has(id)) targets.set(id, { id, name, combatLevel: combatLevels.get(id) });
    }
    return targets;
}

function loadExportedNpcTargets(
    combatLevels: ReadonlyMap<number, number>,
): Map<number, NpcTarget> {
    const parsed = JSON.parse(fs.readFileSync(NPCS_PATH, "utf8")) as ExportedNpc[];
    if (!Array.isArray(parsed)) throw new Error("Generated NPC snapshot must contain an array");
    const targets = new Map<number, NpcTarget>();
    for (const npc of parsed) {
        const id = Number(npc.id);
        const name = String(npc.name ?? "").trim();
        if (!Number.isInteger(id) || id < 0 || !name || name.toLowerCase() === "null") continue;
        const hasAttackAction = (npc.actions ?? []).some(
            (action) => typeof action === "string" && action.toLowerCase() === "attack",
        );
        const combatLevel = combatLevels.get(id);
        if (!hasAttackAction && !(combatLevel && combatLevel > 0)) continue;
        targets.set(id, { id, name, combatLevel });
    }
    return targets;
}

function normalizeCacheName(value: string): string {
    return value
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.\/?/, "")
        .replace(/^caches\//, "")
        .replace(/\/$/, "");
}

function resolveTargetCacheInfo(): CacheInfo {
    if (!fs.existsSync(TARGET_PATH)) {
        throw new Error(`Target cache file was not found: ${TARGET_PATH}`);
    }
    const target = normalizeCacheName(fs.readFileSync(TARGET_PATH, "utf8"));
    if (!target) throw new Error(`Target cache file is empty: ${TARGET_PATH}`);
    const cacheInfo = loadCacheInfos().find((candidate) => candidate.name === target);
    if (!cacheInfo) {
        throw new Error(
            `Target cache '${target}' is not listed in apps/server/var/cache/osrs/caches.json. ` +
                "Run pnpm --filter @august/server ensure-cache first.",
        );
    }
    return cacheInfo;
}

/**
 * Prefer the active cache as the authoritative NPC ID/name/level mapping. A
 * checked-in export is kept as a deterministic fallback so drop maintenance
 * still works on machines that do not have the optional cache bundle.
 */
function loadCacheNpcTargets(
    combatLevels: ReadonlyMap<number, number>,
): Map<number, NpcTarget> {
    try {
        const cacheInfo = resolveTargetCacheInfo();
        const loaded = loadCache(cacheInfo);
        const cacheSystem = CacheSystem.fromFiles(loaded.type, loaded.files);
        const npcTypeLoader = getCacheLoaderFactory(cacheInfo, cacheSystem).getNpcTypeLoader();
        const targets = new Map<number, NpcTarget>();
        for (let id = 0; id < npcTypeLoader.getCount(); id++) {
            try {
                const npc = npcTypeLoader.load(id);
                const name = String(npc.name ?? "").trim();
                if (!name || name.toLowerCase() === "null") continue;
                const actions = npc.actions ?? [];
                const hasAttackAction = actions.some(
                    (action) => typeof action === "string" && action.toLowerCase() === "attack",
                );
                // Include ordinary combat definitions and attackable level-0
                // special cases, but do not issue Wiki requests for every banker,
                // door helper, or cutscene NPC in the cache.
                if ((npc.combatLevel ?? -1) <= 0 && !hasAttackAction) continue;
                const combatLevel =
                    (npc.combatLevel ?? -1) > 0
                        ? Math.trunc(npc.combatLevel)
                        : combatLevels.get(id);
                targets.set(id, { id, name, combatLevel });
            } catch {
                // Some cache indices expose trailing unreadable definitions.
            }
        }
        if (targets.size > 0) return targets;
        throw new Error("active cache contained no combat NPC definitions");
    } catch (error) {
        console.warn(
            `[sync-npc-drops] Active cache unavailable; using data/generated/server/npcs.json: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        return loadExportedNpcTargets(combatLevels);
    }
}

function snapshotExists(): boolean {
    return fs.existsSync(DESTINATION);
}

export function loadItemIdsByName(): Map<string, number> {
    const items = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LocalItem[];
    if (!Array.isArray(items)) throw new Error("Generated items snapshot must contain an array");
    const candidates = new Map<string, LocalItem[]>();
    for (const item of items) {
        const name = item.name?.trim();
        if (!name || name.toLowerCase() === "null") continue;
        const key = normalizeName(name);
        const bucket = candidates.get(key) ?? [];
        bucket.push(item);
        candidates.set(key, bucket);
    }
    const out = new Map<string, number>();
    for (const [name, candidatesForName] of candidates) {
        const unnoted = candidatesForName.filter((item) => item.noted !== true);
        // The cache can contain duplicate client-only variants with the same
        // visible name. Prefer the canonical, lowest unnoted item ID; keeping
        // that deterministic is safer than dropping an otherwise exact Wiki
        // row simply because a visual duplicate was added later in the cache.
        const selected = (unnoted.length > 0 ? unnoted : candidatesForName)
            .slice()
            .sort((left, right) => left.id - right.id)[0];
        if (selected) out.set(name, selected.id);
    }
    // Explicit overrides are applied last so a lower-ID interface/quest
    // duplicate can never replace a canonical economy item such as Coins.
    for (const [name, itemId] of ITEM_NAME_ID_OVERRIDES) out.set(name, itemId);
    return out;
}

function readSnapshot(): Snapshot {
    if (!fs.existsSync(DESTINATION)) {
        return {
            format: "xrsps.osrs-wiki-npc-drops.v1",
            generatedAt: "",
            source: "https://oldschool.runescape.wiki/",
            records: [],
            failures: [],
        };
    }
    const parsed = JSON.parse(fs.readFileSync(DESTINATION, "utf8")) as Partial<Snapshot>;
    if (parsed.format !== "xrsps.osrs-wiki-npc-drops.v1" || !Array.isArray(parsed.records)) {
        throw new Error(`Existing snapshot at ${DESTINATION} has an unexpected format`);
    }
    return {
        format: parsed.format,
        generatedAt: parsed.generatedAt ?? "",
        source: parsed.source ?? "https://oldschool.runescape.wiki/",
        records: parsed.records,
        failures: Array.isArray(parsed.failures) ? parsed.failures : [],
    };
}

function writeSnapshot(records: ReadonlyMap<number, SnapshotRecord>, failures: ReadonlyMap<number, SnapshotFailure>): void {
    const snapshot: Snapshot = {
        format: "xrsps.osrs-wiki-npc-drops.v1",
        generatedAt: new Date().toISOString(),
        source: "https://oldschool.runescape.wiki/ (structured Bucket DropsLine records; wikitext fallback)",
        records: [...records.values()].sort((left, right) => left.npcTypeId - right.npcTypeId),
        failures: [...failures.values()].sort((left, right) => left.npcTypeId - right.npcTypeId),
    };
    fs.mkdirSync(path.dirname(DESTINATION), { recursive: true });
    const temporaryPath = `${DESTINATION}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            // A complete temporary snapshot is atomically promoted. This avoids
            // truncated JSON and tolerates brief OneDrive/antivirus read locks.
            fs.renameSync(temporaryPath, DESTINATION);
            return;
        } catch (error) {
            lastError = error;
            if (attempt < 7) {
                const waitState = new Int32Array(new SharedArrayBuffer(4));
                Atomics.wait(waitState, 0, 0, 50 * 2 ** attempt);
            }
        }
    }
    throw new Error(
        `unable to atomically publish ${DESTINATION}; complete checkpoint remains at ` +
            `${temporaryPath}: ${describeError(lastError)}`,
    );
}

function categoryForHeading(heading: string): DropPool["category"] {
    const normalized = normalizeName(heading).replace(/_/g, " ");
    if (/\bpre[ -]?roll\b/.test(normalized)) return "pre_roll";
    if (/\bsecondary\b/.test(normalized)) return "secondary";
    if (normalized.includes("tertiary")) return "tertiary";
    if (/\bunique(?:s)?\b/.test(normalized)) return "unique";
    if (normalized.includes("weapon") || normalized.includes("armour") || normalized.includes("armor")) return "weapons_armour";
    if (normalized.includes("rune") || normalized.includes("ammo") || normalized.includes("ammunition")) return "runes_ammo";
    if (normalized.includes("coin")) return "coins";
    if (normalized === "other") return "other";
    return "main";
}

function wikiExclusiveRollGroupId(rolls: number): string {
    return `wiki:exclusive:${Math.max(1, Math.trunc(rolls))}`;
}

function wikiDropChainId(rolls: number): string {
    return `wiki:drop-chain:${Math.max(1, Math.trunc(rolls))}`;
}

function wikiPreRollGroupId(rolls: number, order: number): string {
    return `wiki:pre-roll:${Math.max(1, Math.trunc(rolls))}:${Math.max(0, Math.trunc(order))}`;
}

function wikiUniqueRollGroupId(rolls: number): string {
    return `wiki:unique:${Math.max(1, Math.trunc(rolls))}`;
}

function wikiSecondaryRollGroupId(heading: string, rolls: number): string {
    const slug = normalizeName(heading).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `wiki:secondary:${slug || "section"}:${Math.max(1, Math.trunc(rolls))}`;
}

function knownPreRollStages(npcName: string): readonly (readonly number[])[] | undefined {
    const name = normalizeName(npcName);
    if (name === "gargoyle" || name === "marble gargoyle" || name === "bloodthirsty gargoyle") {
        return [[4101], [4153]]; // dark mystic top, then granite maul
    }
    if (name === "abyssal sire") return [[13273, 25624]];
    return undefined;
}

/** Compatibility migration for checkpoints written before wikitext section provenance. */
export function migrateKnownPreRollTable(
    npcName: string,
    table: ImportedTable,
): { table: ImportedTable; changed: boolean } {
    const stages = knownPreRollStages(npcName);
    const pools = table.pools ?? [];
    if (!stages || pools.some((pool) => pool.category === "pre_roll")) {
        return { table, changed: false };
    }
    const stageByItemId = new Map<number, number>();
    stages.forEach((itemIds, order) => itemIds.forEach((itemId) => stageByItemId.set(itemId, order)));
    const staged = new Map<string, { rolls: number; order: number; entries: DropEntry[] }>();
    const retained: DropPool[] = [];
    for (const pool of pools) {
        if (pool.kind !== "weighted") {
            retained.push(pool);
            continue;
        }
        const rolls = Math.max(1, pool.rolls ?? 1);
        const remaining: DropEntry[] = [];
        for (const entry of pool.entries) {
            const order = stageByItemId.get(entry.itemId);
            if (order === undefined) {
                remaining.push(entry);
                continue;
            }
            const key = JSON.stringify([rolls, order]);
            const stage = staged.get(key) ?? { rolls, order, entries: [] };
            stage.entries.push(entry);
            staged.set(key, stage);
        }
        if (remaining.length > 0) retained.push({ ...pool, entries: remaining });
    }
    if (staged.size === 0) return { table, changed: false };
    const rollsWithPreRolls = new Set([...staged.values()].map((stage) => stage.rolls));
    const chainedMain = retained.map((pool) => {
        const rolls = Math.max(1, pool.rolls ?? 1);
        if (
            pool.kind !== "weighted" ||
            pool.category === "secondary" ||
            !rollsWithPreRolls.has(rolls)
        ) {
            return pool;
        }
        return {
            ...pool,
            rollGroupId: wikiExclusiveRollGroupId(rolls),
            rollChainId: wikiDropChainId(rolls),
            rollChainOrder: stages.length,
            rolls,
        };
    });
    const preRollPools = [...staged.values()]
        .sort((left, right) => left.rolls - right.rolls || left.order - right.order)
        .map<DropPool>((stage) => ({
            kind: "weighted",
            category: "pre_roll",
            rollGroupId: wikiPreRollGroupId(stage.rolls, stage.order),
            rollChainId: wikiDropChainId(stage.rolls),
            rollChainOrder: stage.order,
            rolls: stage.rolls,
            entries: stage.entries,
        }));
    return {
        table: {
            ...(table.always ? { always: table.always } : {}),
            pools: [...preRollPools, ...chainedMain],
        },
        changed: true,
    };
}

function extractDropSection(html: string): string | undefined {
    const start = html.search(/<h2\s+id="Drops">/i);
    if (start < 0) return undefined;
    const endMatch = /<h2\s+id="[^"]+">/gi;
    endMatch.lastIndex = start + 1;
    const end = endMatch.exec(html)?.index ?? html.length;
    return html.slice(start, end);
}

function parseRows(tableHtml: string, itemIdsByName: ReadonlyMap<string, number>): { rows: ParsedRow[]; errors: string[] } {
    const rows: ParsedRow[] = [];
    const errors: string[] = [];
    for (const rowMatch of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const row = rowMatch[1];
        if (!/item-col/i.test(row)) continue;
        const cells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
        const itemCellIndex = cells.findIndex((cell) => /item-col/i.test(cell[1]));
        if (itemCellIndex < 0 || itemCellIndex + 1 >= cells.length) continue;
        const itemLink = /<a\b[^>]*\btitle="([^"]+)"/i.exec(cells[itemCellIndex][2]);
        const title = itemLink ? decodeHtml(itemLink[1]) : "";
        const normalizedTitle = normalizeName(title);
        // "Nothing" represents the empty branch of a Wiki drop subtable,
        // not a cache item. Its probability is already preserved by the
        // weighted pool's remaining probability.
        if (normalizedTitle === "nothing") continue;
        const itemId =
            ITEM_NAME_ID_OVERRIDES.get(normalizedTitle) ??
            itemIdsByName.get(ITEM_NAME_ALIASES.get(normalizedTitle) ?? normalizedTitle);
        if (itemId === undefined) {
            errors.push(`unmapped item '${title || "unknown"}'`);
            continue;
        }
        const quantityCell = cells[itemCellIndex + 1];
        const quantitySort = /data-sort-value="([^"]+)"/i.exec(quantityCell[1])?.[1];
        const quantity = decodeHtml(quantitySort ?? quantityCell[2]).replace(/,/g, "");
        const fraction = /data-drop-fraction="([^"]+)"/i.exec(row)?.[1];
        const always = /<span>\s*Always\s*<\/span>/i.test(row);
        if (!fraction && !always) {
            errors.push(`missing rarity for '${title}'`);
            continue;
        }
        rows.push({ itemId, quantity: quantity || "1", rarity: always ? "Always" : decodeHtml(fraction!) });
    }
    return { rows, errors };
}

function parseDropTable(html: string, itemIdsByName: ReadonlyMap<string, number>): { table?: ImportedTable; errors: string[] } {
    const section = extractDropSection(html);
    if (!section) return { errors: ["page has no Drops section"] };
    const headings = [...section.matchAll(/<h3\s+id="([^"]+)">([\s\S]*?)<\/h3>/gi)];
    if (headings.length === 0) return { errors: ["Drops section has no drop-table headings"] };
    const always: DropEntry[] = [];
    const poolsByCategory = new Map<DropPool["category"], DropEntry[]>();
    const errors: string[] = [];
    for (let index = 0; index < headings.length; index++) {
        const heading = decodeHtml(headings[index][2] || headings[index][1]);
        const sliceStart = headings[index].index! + headings[index][0].length;
        const sliceEnd = index + 1 < headings.length ? headings[index + 1].index! : section.length;
        const subsection = section.slice(sliceStart, sliceEnd);
        const tables = [...subsection.matchAll(/<table\b[^>]*\bitem-drops\b[^>]*>([\s\S]*?)<\/table>/gi)];
        if (tables.length === 0) continue;
        const category = categoryForHeading(heading);
        for (const tableMatch of tables) {
            const parsed = parseRows(tableMatch[1], itemIdsByName);
            errors.push(...parsed.errors.map((error) => `${heading}: ${error}`));
            if (heading === "100%") always.push(...parsed.rows);
            else {
                const bucket = poolsByCategory.get(category) ?? [];
                bucket.push(...parsed.rows);
                poolsByCategory.set(category, bucket);
            }
        }
    }
    const pools: DropPool[] = [...poolsByCategory].map(([category, entries]) => ({
        kind: category === "tertiary" ? "independent" : "weighted",
        category,
        entries,
    }));
    if (always.length === 0 && pools.length === 0) errors.push("no mapped drop rows");
    return { table: always.length > 0 || pools.length > 0 ? { always, pools } : undefined, errors };
}

/**
 * The Wiki's rendered tables are designed for browsers and change their HTML
 * structure regularly. Its page source is considerably more stable: each
 * ordinary row is a DropsLine template with named item/quantity/rarity/rolls
 * fields. Read that source directly so a missing CSS class or an unmapped
 * decorative row cannot erase an otherwise useful NPC table.
 */
function extractWikitextDropSection(source: string): string | undefined {
    const start = source.search(/^==\s*Drops\s*==\s*$/im);
    if (start < 0) return undefined;
    const afterHeading = source.indexOf("\n", start);
    if (afterHeading < 0) return undefined;
    const nextSection = /^==[^=].*?==\s*$/gm;
    nextSection.lastIndex = afterHeading + 1;
    const end = nextSection.exec(source)?.index ?? source.length;
    return source.slice(afterHeading + 1, end);
}

function splitTopLevel(value: string, delimiter: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let templates = 0;
    let links = 0;
    for (let index = 0; index < value.length; index++) {
        const pair = value.slice(index, index + 2);
        if (pair === "{{") {
            templates++;
            index++;
            continue;
        }
        if (pair === "}}" && templates > 0) {
            templates--;
            index++;
            continue;
        }
        if (pair === "[[") {
            links++;
            index++;
            continue;
        }
        if (pair === "]]" && links > 0) {
            links--;
            index++;
            continue;
        }
        if (value[index] === delimiter && templates === 0 && links === 0) {
            parts.push(value.slice(start, index));
            start = index + 1;
        }
    }
    parts.push(value.slice(start));
    return parts;
}

function topLevelEquals(value: string): number {
    let templates = 0;
    let links = 0;
    for (let index = 0; index < value.length; index++) {
        const pair = value.slice(index, index + 2);
        if (pair === "{{") {
            templates++;
            index++;
            continue;
        }
        if (pair === "}}" && templates > 0) {
            templates--;
            index++;
            continue;
        }
        if (pair === "[[") {
            links++;
            index++;
            continue;
        }
        if (pair === "]]" && links > 0) {
            links--;
            index++;
            continue;
        }
        if (value[index] === "=" && templates === 0 && links === 0) return index;
    }
    return -1;
}

function extractTemplateBlocks(source: string): string[] {
    const blocks: string[] = [];
    for (let start = source.indexOf("{{"); start >= 0; start = source.indexOf("{{", start + 2)) {
        let depth = 0;
        let end = -1;
        for (let index = start; index < source.length - 1; index++) {
            const pair = source.slice(index, index + 2);
            if (pair === "{{") {
                depth++;
                index++;
                continue;
            }
            if (pair === "}}") {
                depth--;
                index++;
                if (depth === 0) {
                    end = index + 1;
                    break;
                }
            }
        }
        if (end < 0) break;
        blocks.push(source.slice(start, end));
        start = end - 1;
    }
    return blocks;
}

function stripWikitext(value: string): string {
    return value
        .replace(/<!--([\s\S]*?)-->/g, "")
        .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
        .replace(/<ref\b[^/>]*\/?\s*>/gi, "")
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/''+/g, "")
        .replace(/<[^>]+>/g, "")
        .trim();
}

function parseTemplate(block: string): { name: string; args: Map<string, string> } | undefined {
    if (!block.startsWith("{{") || !block.endsWith("}}")) return undefined;
    const parts = splitTopLevel(block.slice(2, -2), "|");
    const name = normalizeName(parts.shift() ?? "");
    if (!name) return undefined;
    const args = new Map<string, string>();
    for (const part of parts) {
        const equals = topLevelEquals(part);
        if (equals < 0) continue;
        args.set(normalizeName(part.slice(0, equals)), part.slice(equals + 1).trim());
    }
    return { name, args };
}

function referenceName(attributes: string, content: string): string | undefined {
    const quoted = /\bname\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2];
    const unquoted = /\bname\s*=\s*([^\s/>]+)/i.exec(attributes)?.[1];
    const raw = quoted ?? unquoted;
    if (raw?.trim()) return normalizeName(raw);
    const normalizedContent = normalizeName(stripWikitext(content));
    return normalizedContent ? `content:${normalizedContent}` : undefined;
}

/**
 * DropsLine's semantic JSON intentionally omits citation text. The page source
 * retains named footnotes such as "these potions are always dropped together".
 * Rows sharing one of those references are a single outcome, not independent
 * table slots, so preserve that relationship alongside the structured data.
 */
export function extractWikitextOutcomeIds(source: string): Map<string, string> {
    const section = extractWikitextDropSection(source);
    if (!section) return new Map();
    const references = new Map<string, { items: Set<string>; together: boolean }>();
    for (const block of extractTemplateBlocks(section)) {
        const template = parseTemplate(block);
        if (!template || !template.name.startsWith("dropsline")) continue;
        const clueType = stripWikitext(template.args.get("type") ?? "");
        const rawName = stripWikitext(
            template.args.get("name") ??
                template.args.get("item") ??
                (template.name === "dropslineclue" && clueType ? `Clue scroll (${clueType})` : ""),
        );
        const itemName = normalizeName(rawName);
        if (!itemName) continue;
        const notes = [
            template.args.get("raritynotes"),
            template.args.get("namenotes"),
            template.args.get("quantitynotes"),
        ]
            .filter((value): value is string => typeof value === "string" && value.length > 0)
            .join(" ");
        const matches = [
            ...notes.matchAll(/<ref\b([^>]*)>([\s\S]*?)<\/ref>/gi),
            ...notes.matchAll(/<ref\b([^>]*)\/\s*>/gi),
        ];
        for (const match of matches) {
            const attributes = match[1] ?? "";
            const content = match[2] ?? "";
            const key = referenceName(attributes, content);
            if (!key) continue;
            const reference = references.get(key) ?? { items: new Set<string>(), together: false };
            reference.items.add(itemName);
            if (/\b(?:always\s+)?drop(?:ped)?\s+together\b|\ball\s+(?:are\s+)?drop(?:ped)?\s+together\b/i.test(stripWikitext(content))) {
                reference.together = true;
            }
            references.set(key, reference);
        }
    }

    const outcomes = new Map<string, string>();
    for (const [key, reference] of references) {
        if (!reference.together || reference.items.size < 2) continue;
        const outcomeId = `wiki:${key}`;
        for (const itemName of reference.items) outcomes.set(itemName, outcomeId);
    }
    return outcomes;
}

function parsePositiveInteger(value: string | undefined): number {
    const parsed = Number.parseInt(stripWikitext(value ?? ""), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function splitWikitextDropSubsections(
    source: string,
): Array<{ heading: string; body: string }> {
    const section = extractWikitextDropSection(source);
    if (!section) return [];
    const headings = [...section.matchAll(/^={3,}\s*(.*?)\s*=+\s*$/gm)];
    if (headings.length === 0) return [{ heading: "Main drops", body: section }];
    return headings.map((match, index) => ({
        heading: stripWikitext(match[1]),
        body: section.slice(
            match.index! + match[0].length,
            index + 1 < headings.length ? headings[index + 1].index! : section.length,
        ),
    }));
}

function normalizedRarityKey(value: string): string {
    return stripWikitext(value).replace(/,/g, "").replace(/\s+/g, "").toLowerCase();
}

/**
 * Bucket's DropsLine JSON deliberately has no section/table field. Recover it
 * from the same page's wikitext so equal `Rolls` values do not accidentally
 * merge a secondary table into the main roll. The returned item-name map can
 * contain several candidates; rarity and roll count disambiguate them later.
 */
export function extractWikitextDropProvenance(source: string): WikitextDropProvenance {
    const provisional: Array<{
        itemName: string;
        metadata: WikitextDropSectionProvenance;
    }> = [];
    const warnings: string[] = [];
    for (const [sectionOrder, subsection] of splitWikitextDropSubsections(source).entries()) {
        let rowOrder = 0;
        for (const block of extractTemplateBlocks(subsection.body)) {
            const template = parseTemplate(block);
            if (!template || !template.name.startsWith("dropsline")) continue;
            const clueType = stripWikitext(template.args.get("type") ?? "");
            const rawName = stripWikitext(
                template.args.get("name") ??
                    template.args.get("item") ??
                    (template.name === "dropslineclue" && clueType
                        ? `Clue scroll (${clueType})`
                        : ""),
            );
            const itemName = normalizeName(rawName);
            if (!itemName || itemName === "nothing") continue;
            provisional.push({
                itemName,
                metadata: {
                    heading: subsection.heading,
                    category: categoryForHeading(subsection.heading),
                    sectionOrder,
                    rowOrder: rowOrder++,
                    rolls: parsePositiveInteger(template.args.get("rolls")),
                    rarity: normalizedRarityKey(template.args.get("rarity") ?? ""),
                    wildernessRegion: normalizeName(
                        stripWikitext(template.args.get("leagueregion") ?? ""),
                    ).includes("wilderness"),
                },
            });
        }
    }

    // Wiki display order is not guaranteed to be engine order. The OSRS Wiki
    // explicitly documents gargoyles as dark mystic top -> granite maul ->
    // main, while the current page renders the two rows in the reverse order.
    const knownGargoyleOrder = new Map<string, number>([
        ["mystic robe top (dark)", 0],
        ["granite maul", 1],
    ]);
    const preRollSections = new Map<string, typeof provisional>();
    for (const row of provisional) {
        if (row.metadata.category !== "pre_roll") continue;
        const key = JSON.stringify([row.metadata.sectionOrder, row.metadata.rolls]);
        const rows = preRollSections.get(key) ?? [];
        rows.push(row);
        preRollSections.set(key, rows);
    }
    const nextOrderByRolls = new Map<number, number>();
    for (const rows of [...preRollSections.values()].sort(
        (left, right) => left[0].metadata.sectionOrder - right[0].metadata.sectionOrder,
    )) {
        const rolls = rows[0].metadata.rolls;
        const containsKnownGargoyleSequence = [...knownGargoyleOrder.keys()].every((name) =>
            rows.some((row) => row.itemName === name),
        );
        const ordered = rows.slice().sort((left, right) => {
            if (containsKnownGargoyleSequence) {
                const leftKnown = knownGargoyleOrder.get(left.itemName) ?? Number.MAX_SAFE_INTEGER;
                const rightKnown = knownGargoyleOrder.get(right.itemName) ?? Number.MAX_SAFE_INTEGER;
                if (leftKnown !== rightKnown) return leftKnown - rightKnown;
            }
            return left.metadata.rowOrder - right.metadata.rowOrder;
        });
        if (ordered.length > 1 && !containsKnownGargoyleSequence) {
            warnings.push(
                `pre-roll order for '${rows[0].metadata.heading}' is not independently documented; ` +
                    "source display order retained",
            );
        }
        const offset = nextOrderByRolls.get(rolls) ?? 0;
        ordered.forEach((row, index) => {
            row.metadata.preRollOrder = offset + index;
        });
        nextOrderByRolls.set(rolls, offset + ordered.length);
    }

    const byItemName = new Map<string, WikitextDropSectionProvenance[]>();
    for (const row of provisional) {
        const entries = byItemName.get(row.itemName) ?? [];
        entries.push(row.metadata);
        byItemName.set(row.itemName, entries);
    }
    return { byItemName, warnings };
}

function resolveWikitextDropProvenance(
    provenance: WikitextDropProvenance,
    itemName: string,
    rarity: string,
    rolls: number,
): WikitextDropSectionProvenance | undefined {
    const candidates = provenance.byItemName.get(normalizeName(itemName)) ?? [];
    if (candidates.length === 0) return undefined;
    const rarityKey = normalizedRarityKey(rarity);
    const exact = candidates.filter(
        (candidate) => candidate.rolls === rolls && candidate.rarity === rarityKey,
    );
    const rollMatches = candidates.filter((candidate) => candidate.rolls === rolls);
    const selected = exact.length > 0 ? exact : rollMatches.length > 0 ? rollMatches : candidates;
    const semanticKeys = new Set(
        selected.map((candidate) =>
            JSON.stringify([
                candidate.category,
                candidate.heading,
                candidate.preRollOrder ?? -1,
                candidate.wildernessRegion,
            ]),
        ),
    );
    return semanticKeys.size === 1 ? selected[0] : undefined;
}

function parseWikitextRows(
    source: string,
    heading: string,
    itemIdsByName: ReadonlyMap<string, number>,
    outcomeIds: ReadonlyMap<string, string>,
): { rows: ParsedWikitextRow[]; errors: string[] } {
    const rows: ParsedWikitextRow[] = [];
    const errors: string[] = [];
    for (const block of extractTemplateBlocks(source)) {
        const template = parseTemplate(block);
        if (!template || !template.name.startsWith("dropsline")) continue;
        const clueType = stripWikitext(template.args.get("type") ?? "");
        const rawName = stripWikitext(
            template.args.get("name") ??
                template.args.get("item") ??
                (template.name === "dropslineclue" && clueType ? `Clue scroll (${clueType})` : ""),
        );
        if (!rawName) {
            errors.push(`${heading}: missing item name`);
            continue;
        }
        const normalizedName = normalizeName(rawName);
        if (normalizedName === "nothing") continue;
        const itemId =
            ITEM_NAME_ID_OVERRIDES.get(normalizedName) ??
            itemIdsByName.get(ITEM_NAME_ALIASES.get(normalizedName) ?? normalizedName);
        if (itemId === undefined) {
            errors.push(`${heading}: unmapped item '${rawName}'`);
            continue;
        }
        if (FROZEN_KEY_PIECE_ITEM_IDS.has(itemId)) {
            errors.push(`${heading}: ${FROZEN_KEY_PIECE_WARNING}`);
            continue;
        }
        const rarity = stripWikitext(template.args.get("rarity") ?? "");
        if (!rarity || rarity.includes("{{")) {
            errors.push(`${heading}: unresolved rarity for '${rawName}'`);
            continue;
        }
        const nameNotes = stripWikitext(template.args.get("namenotes") ?? "");
        let quantity =
            stripWikitext(template.args.get("quantity") ?? "1").replace(/,/g, "") || "1";
        if (/\bnoted\b/i.test(nameNotes) && !/\(\s*noted\s*\)/i.test(quantity)) {
            quantity += " (noted)";
        }
        // The fallback cannot safely infer alternate rates, but known base
        // eligibility rules must still fail closed while the Bucket-backed
        // record remains incomplete and queued for retry.
        const condition = contextualDropMetadata(rawName, {}, false, errors).condition;
        rows.push({
            itemId,
            itemName: normalizedName,
            quantity,
            rarity,
            rolls: parsePositiveInteger(template.args.get("rolls")),
            ...(condition ? { condition } : {}),
            outcomeId: outcomeIds.get(normalizedName),
        });
    }
    return { rows, errors };
}

export function parseWikitextDropTable(
    source: string,
    itemIdsByName: ReadonlyMap<string, number>,
): { table?: ImportedTable; errors: string[] } {
    const section = extractWikitextDropSection(source);
    if (!section) return { errors: ["page has no Drops section"] };
    const sections = splitWikitextDropSubsections(source);
    const always: DropEntry[] = [];
    const poolsByKey = new Map<string, DropPool>();
    const errors: string[] = [];
    const outcomeIds = extractWikitextOutcomeIds(source);
    const provenance = extractWikitextDropProvenance(source);
    errors.push(...provenance.warnings);
    const mainChainOrderByRolls = new Map<number, number>();
    const wildernessUniqueRolls = new Set<number>();
    for (const candidates of provenance.byItemName.values()) {
        for (const candidate of candidates) {
            if (candidate.preRollOrder === undefined) continue;
            mainChainOrderByRolls.set(
                candidate.rolls,
                Math.max(
                    mainChainOrderByRolls.get(candidate.rolls) ?? 0,
                    candidate.preRollOrder + 1,
                ),
            );
        }
    }
    for (const candidates of provenance.byItemName.values()) {
        for (const candidate of candidates) {
            if (candidate.category === "unique" && candidate.wildernessRegion) {
                wildernessUniqueRolls.add(candidate.rolls);
            }
        }
    }
    const uniqueChainOrderByRolls = new Map<number, number>();
    for (const rolls of wildernessUniqueRolls) {
        const uniqueOrder = mainChainOrderByRolls.get(rolls) ?? 0;
        uniqueChainOrderByRolls.set(rolls, uniqueOrder);
        mainChainOrderByRolls.set(rolls, uniqueOrder + 1);
    }
    let warnedAboutUnique = false;
    for (const subsection of sections) {
        const parsed = parseWikitextRows(
            subsection.body,
            subsection.heading,
            itemIdsByName,
            outcomeIds,
        );
        errors.push(...parsed.errors);
        if (parsed.rows.length === 0) continue;
        const alwaysHeading = normalizeName(subsection.heading) === "100%";
        for (const row of parsed.rows) {
            if (alwaysHeading || normalizeName(row.rarity) === "always") {
                always.push({
                    itemId: row.itemId,
                    quantity: row.quantity,
                    rarity: "Always",
                    ...(row.condition ? { condition: row.condition } : {}),
                });
                continue;
            }
            const sourceMetadata = resolveWikitextDropProvenance(
                provenance,
                row.itemName,
                row.rarity,
                row.rolls,
            );
            let category = sourceMetadata?.category ?? categoryForHeading(subsection.heading);
            if (isKnownIndependentDrop(row.itemName)) category = "tertiary";
            const wildernessUnique =
                category === "unique" && wildernessUniqueRolls.has(row.rolls);
            if (category === "unique" && !wildernessUnique && !warnedAboutUnique) {
                errors.push(
                    "Unique section retained in the main roll because its pre-roll semantics are boss-specific",
                );
                warnedAboutUnique = true;
            }
            const kind = category === "tertiary" ? "independent" : "weighted";
            const preRollOrder = sourceMetadata?.preRollOrder;
            const mainChainOrder = mainChainOrderByRolls.get(row.rolls);
            const rollGroupId =
                category === "pre_roll" && preRollOrder !== undefined
                    ? wikiPreRollGroupId(row.rolls, preRollOrder)
                    : wildernessUnique
                      ? wikiUniqueRollGroupId(row.rolls)
                    : category === "secondary"
                      ? wikiSecondaryRollGroupId(sourceMetadata?.heading ?? subsection.heading, row.rolls)
                      : wikiExclusiveRollGroupId(row.rolls);
            const rollChainOrder =
                category === "pre_roll"
                    ? preRollOrder
                    : wildernessUnique
                      ? uniqueChainOrderByRolls.get(row.rolls)
                    : category !== "secondary" && kind === "weighted"
                      ? mainChainOrder
                      : undefined;
            const key = JSON.stringify([
                kind,
                category,
                rollGroupId,
                row.rolls,
                rollChainOrder ?? -1,
            ]);
            const pool = poolsByKey.get(key) ?? {
                kind,
                category,
                ...(kind === "weighted"
                    ? {
                          rollGroupId,
                          ...(rollChainOrder !== undefined
                              ? {
                                    rollChainId: wikiDropChainId(row.rolls),
                                    rollChainOrder,
                                }
                              : {}),
                      }
                    : {}),
                rolls: row.rolls,
                entries: [],
            };
            pool.entries.push({
                itemId: row.itemId,
                quantity: row.quantity,
                rarity: row.rarity,
                ...(row.condition ? { condition: row.condition } : {}),
                outcomeId: row.outcomeId,
            });
            poolsByKey.set(key, pool);
        }
    }
    if (/\{\{\s*(?:rare\s*drop\s*table|gem\s*drop\s*table)/i.test(section)) {
        errors.push("dynamic shared drop table requires a dedicated import pass");
    }
    const pools = [...poolsByKey.values()];
    if (always.length === 0 && pools.length === 0) errors.push("no cache-backed DropsLine rows");
    return { table: always.length > 0 || pools.length > 0 ? { always, pools } : undefined, errors };
}

function resolveImportedItemId(
    rawName: string,
    itemIdsByName: ReadonlyMap<string, number>,
): number | undefined {
    const normalizedName = normalizeName(rawName);
    return (
        ITEM_NAME_ID_OVERRIDES.get(normalizedName) ??
        itemIdsByName.get(ITEM_NAME_ALIASES.get(normalizedName) ?? normalizedName)
    );
}

function normalizedBucketQuantity(drop: BucketDropJson): string {
    const rawQuantity = String(drop["Drop Quantity"] ?? "1");
    const low = Number(drop["Quantity Low"]);
    const high = Number(drop["Quantity High"]);
    let quantity: string;
    if (Number.isFinite(low) && low > 0 && Number.isFinite(high) && high > 0) {
        const min = Math.max(1, Math.trunc(Math.min(low, high)));
        const max = Math.max(min, Math.trunc(Math.max(low, high)));
        quantity = min === max ? String(min) : `${min}-${max}`;
    } else {
        const values = [...rawQuantity.matchAll(/\d+/g)].map((match) => Number(match[0]));
        const min = values[0] ?? 1;
        const max = values[values.length - 1] ?? min;
        quantity = min === max ? String(min) : `${Math.min(min, max)}-${Math.max(min, max)}`;
    }
    const notes = `${drop["Name Notes"] ?? ""} ${rawQuantity}`;
    return /\bnoted\b/i.test(notes) ? `${quantity} (noted)` : quantity;
}

function parseDropLevels(value: string | number | undefined): number[] {
    if (typeof value === "number" && Number.isFinite(value)) return [Math.trunc(value)];
    return [...String(value ?? "").matchAll(/\d+/g)]
        .map((match) => Number(match[0]))
        .filter((level) => Number.isInteger(level) && level > 0);
}

function isKnownIndependentDrop(rawName: string): boolean {
    const name = normalizeName(rawName);
    return (
        name.startsWith("clue scroll") ||
        name.startsWith("pet ") ||
        name.startsWith("jar of ") ||
        name === "brimstone key" ||
        name === "giant key" ||
        name === "mossy key" ||
        name === "ecumenical key" ||
        name === "larran's key" ||
        name === "slayer's enchantment" ||
        name === "looting bag" ||
        name === "long bone" ||
        name === "curved bone" ||
        name.includes("champion scroll") ||
        name.startsWith("ensouled ") ||
        name.startsWith("ancient shard") ||
        name.startsWith("dark totem") ||
        name.startsWith("skotizo totem")
    );
}

function parseBucketProbability(value: string): number | undefined {
    const raw = value.replace(/,/g, "").trim().toLowerCase();
    if (raw === "always") return 1;
    const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(raw);
    if (fraction) {
        const numerator = Number(fraction[1]);
        const denominator = Number(fraction[2]);
        return denominator > 0 ? numerator / denominator : undefined;
    }
    const direct = Number(raw);
    return Number.isFinite(direct) && direct >= 0 ? direct : undefined;
}

function contextualDropMetadata(
    rawName: string,
    drop: BucketDropJson,
    rareDropTable: boolean,
    errors: string[],
): Pick<DropEntry, "altRarity" | "condition" | "altCondition"> {
    const name = normalizeName(rawName);
    const altRarity = String(drop["Alt Rarity"] ?? "").replace(/,/g, "").trim();
    const isRingOfWealthRareTableItem = RING_OF_WEALTH_RARE_TABLE_ITEMS.has(name);
    if (name === "brimstone key") {
        return {
            condition: {
                slayerTaskOnly: true,
                requiredSlayerMaster: "konar quo maten",
            },
        };
    }
    if (name === "larran's key") {
        return {
            condition: {
                recipientWildernessOnly: true,
                slayerTaskOnly: true,
                requiredSlayerMaster: "krystilia",
            },
        };
    }
    if (name === "slayer's enchantment") {
        return {
            condition: {
                recipientWildernessOnly: true,
                slayerTaskOnly: true,
                requiredSlayerMaster: "krystilia",
            },
        };
    }
    if (name === "ecumenical key") {
        // Combat Achievement rate upgrades are intentionally left at their
        // base 1/60 until that player progression is represented server-side.
        return { condition: { wildernessGodWarsDungeonOnly: true } };
    }
    if (name === "looting bag") {
        return { condition: { wildernessOnly: true } };
    }
    if ((name === "giant key" || name === "mossy key") && altRarity) {
        if (parseBucketProbability(altRarity) === undefined) {
            errors.push(`unresolved alternate rarity '${altRarity}' for '${rawName}'`);
            return {};
        }
        return { altRarity, altCondition: { wildernessOnly: true } };
    }
    if (name.startsWith("clue scroll") && altRarity) {
        if (parseBucketProbability(altRarity) === undefined) {
            errors.push(`unresolved alternate rarity '${altRarity}' for '${rawName}'`);
            return {};
        }
        return {
            altRarity,
            altCondition: {
                wildernessOnly: true,
                requiredAnyEquippedItemIds: [12785, 20786, 20787, 20788, 20789, 20790, 21458, 21459],
            },
        };
    }
    if ((rareDropTable || isRingOfWealthRareTableItem) && altRarity) {
        if (parseBucketProbability(altRarity) === undefined) {
            errors.push(`unresolved alternate rarity '${altRarity}' for '${rawName}'`);
            return {};
        }
        return {
            altRarity,
            altCondition: {
                requiredAnyEquippedItemIds: [
                    2572,
                    11980,
                    11982,
                    11984,
                    11986,
                    11988,
                    12785,
                    20786,
                    20787,
                    20788,
                    20789,
                    20790,
                    21456,
                    21457,
                    21458,
                    21459,
                ],
            },
        };
    }
    if (altRarity) {
        errors.push(`unhandled alternate rarity '${altRarity}' for '${rawName}'`);
    }
    return {};
}

export function restrictedDropConditionForItemId(
    itemId: number,
): DropCondition | undefined {
    switch (itemId) {
        case 23490: // Larran's key
        case 21257: // Slayer's enchantment
            return {
                recipientWildernessOnly: true,
                slayerTaskOnly: true,
                requiredSlayerMaster: "krystilia",
            };
        case 23083: // Brimstone key
            return {
                slayerTaskOnly: true,
                requiredSlayerMaster: "konar quo maten",
            };
        case 11942: // Ecumenical key
            return { wildernessGodWarsDungeonOnly: true };
        case 11941: // Looting bag
            return { wildernessOnly: true };
        default:
            return undefined;
    }
}

function canonicalRestrictedDropCondition(
    itemId: number,
    existing: DropCondition | undefined,
): DropCondition | undefined {
    const required = restrictedDropConditionForItemId(itemId);
    if (!required) return existing;
    const requiredAnyEquippedItemIds = existing?.requiredAnyEquippedItemIds;
    return {
        ...required,
        ...(requiredAnyEquippedItemIds && requiredAnyEquippedItemIds.length > 0
            ? { requiredAnyEquippedItemIds }
            : {}),
    };
}

function countUsableSnapshotEntries(record: SnapshotRecord): number {
    const always = record.table.always?.filter((entry) => entry.itemId > 0).length ?? 0;
    const probabilistic =
        record.table.pools?.reduce(
            (count, pool) =>
                count +
                pool.entries.filter(
                    (entry) =>
                        entry.itemId > 0 &&
                        parseBucketProbability(String(entry.rarity ?? "")) !== undefined,
                ).length,
            0,
        ) ?? 0;
    return always + probabilistic;
}

function serializeSnapshotCondition(condition: DropCondition | undefined): string {
    const requiredAnyEquippedItemIds = [
        ...new Set(
            (condition?.requiredAnyEquippedItemIds ?? [])
                .filter((itemId) => Number.isInteger(itemId) && itemId > 0),
        ),
    ].sort((left, right) => left - right);
    // Build the normalized object in a fixed field order. Boolean false,
    // whitespace/case-only master changes, and equipment-list ordering are
    // runtime-equivalent and must not make checkpoint selection unstable.
    return JSON.stringify({
        wildernessOnly: condition?.wildernessOnly === true || undefined,
        recipientWildernessOnly: condition?.recipientWildernessOnly === true || undefined,
        wildernessGodWarsDungeonOnly:
            condition?.wildernessGodWarsDungeonOnly === true || undefined,
        slayerTaskOnly: condition?.slayerTaskOnly === true || undefined,
        requiredSlayerMaster:
            condition?.requiredSlayerMaster?.trim().toLowerCase() || undefined,
        requiredAnyEquippedItemIds:
            requiredAnyEquippedItemIds.length > 0 ? requiredAnyEquippedItemIds : undefined,
    });
}

export function hardenRestrictedSnapshotRecord(
    record: SnapshotRecord,
): { record: SnapshotRecord; changedEntries: number } {
    let changedEntries = 0;
    const hardenEntry = (entry: DropEntry): DropEntry => {
        const condition = canonicalRestrictedDropCondition(entry.itemId, entry.condition);
        if (!condition || serializeSnapshotCondition(entry.condition) === serializeSnapshotCondition(condition)) {
            return entry;
        }
        changedEntries++;
        return { ...entry, condition };
    };
    const always = record.table.always?.map(hardenEntry);
    const pools = record.table.pools?.map((pool) => ({
        ...pool,
        entries: pool.entries.map(hardenEntry),
    }));
    if (changedEntries === 0) return { record, changedEntries };
    return {
        record: {
            ...record,
            table: {
                ...(always ? { always } : {}),
                ...(pools ? { pools } : {}),
            },
        },
        changedEntries,
    };
}

export function omitUnsafeConditionalQuestDrops(
    record: SnapshotRecord,
): { record: SnapshotRecord; removedEntries: number; changedMetadata: boolean } {
    let removedEntries = 0;
    const retainEntry = (entry: DropEntry): boolean => {
        if (!FROZEN_KEY_PIECE_ITEM_IDS.has(entry.itemId)) return true;
        removedEntries++;
        return false;
    };
    const always = record.table.always?.filter(retainEntry);
    const pools = record.table.pools
        ?.map((pool) => ({ ...pool, entries: pool.entries.filter(retainEntry) }))
        .filter((pool) => pool.entries.length > 0);
    const alreadyWarned = record.warnings?.includes(FROZEN_KEY_PIECE_WARNING) === true;
    const needsLegacyMetadataRepair =
        removedEntries === 0 &&
        alreadyWarned &&
        record.omittedConditionalQuestRows === undefined;
    if (removedEntries === 0 && !needsLegacyMetadataRepair) {
        return { record, removedEntries, changedMetadata: false };
    }
    const warningWasTheOnlyIncompleteReason =
        needsLegacyMetadataRepair &&
        record.incomplete === true &&
        record.warnings?.length === 1;
    return {
        record: {
            ...record,
            ...(warningWasTheOnlyIncompleteReason ? { incomplete: undefined } : {}),
            omittedConditionalQuestRows:
                (record.omittedConditionalQuestRows ?? 0) + Math.max(1, removedEntries),
            warnings: [...new Set([...(record.warnings ?? []), FROZEN_KEY_PIECE_WARNING])],
            table: {
                ...(always ? { always } : {}),
                ...(pools ? { pools } : {}),
            },
        },
        removedEntries,
        changedMetadata: true,
    };
}

export function migrateSnapshotRecord(record: SnapshotRecord): {
    record: SnapshotRecord;
    changedRestrictedEntries: number;
    changedRollTable: boolean;
    removedConditionalQuestEntries: number;
    changedConditionalQuestMetadata: boolean;
} {
    const omitted = omitUnsafeConditionalQuestDrops(record);
    const hardened = hardenRestrictedSnapshotRecord(omitted.record);
    const migratedRolls = migrateKnownPreRollTable(
        hardened.record.name,
        hardened.record.table,
    );
    return {
        record: migratedRolls.changed
            ? { ...hardened.record, table: migratedRolls.table }
            : hardened.record,
        changedRestrictedEntries: hardened.changedEntries,
        changedRollTable: migratedRolls.changed,
        removedConditionalQuestEntries: omitted.removedEntries,
        changedConditionalQuestMetadata: omitted.changedMetadata,
    };
}

function snapshotEntryKey(
    entry: DropEntry,
    location:
        | readonly ["always"]
        | readonly [
              "pool",
              DropPool["kind"],
              DropPool["category"],
              string,
              number,
              string,
              number,
          ],
): string {
    // Old wikitext checkpoints predate fail-closed eligibility metadata.
    // Treat their missing condition as the known mandatory condition during
    // comparison, so a safe hardening refresh is not mistaken for data loss.
    const condition = canonicalRestrictedDropCondition(entry.itemId, entry.condition);
    return JSON.stringify([
        ...location,
        entry.itemId,
        entry.quantity,
        entry.rarity,
        entry.altRarity ?? "",
        serializeSnapshotCondition(condition),
        serializeSnapshotCondition(entry.altCondition),
        entry.outcomeId ?? "",
    ]);
}

function snapshotEntryKeys(record: SnapshotRecord): Set<string> {
    const keys = new Set<string>();
    const table = migrateKnownPreRollTable(record.name, record.table).table;
    for (const entry of table.always ?? []) {
        keys.add(snapshotEntryKey(entry, ["always"]));
    }
    for (const pool of table.pools ?? []) {
        const rolls = Math.max(1, pool.rolls ?? 1);
        const legacyCoinsPool = pool.category === "coins";
        const kind = legacyCoinsPool ? "weighted" : pool.kind;
        const category = legacyCoinsPool ? "main" : pool.category;
        const rollGroupId =
            kind === "weighted"
                ? pool.rollGroupId?.trim() || wikiExclusiveRollGroupId(rolls)
                : pool.rollGroupId?.trim() ?? "";
        const location = [
            "pool",
            kind,
            category,
            rollGroupId,
            rolls,
            pool.rollChainId?.trim() ?? "",
            pool.rollChainOrder ?? -1,
        ] as const;
        for (const entry of pool.entries) keys.add(snapshotEntryKey(entry, location));
    }
    return keys;
}

function importerRank(importer: string | undefined): number {
    if (importer === IMPORT_VERSION) return 3;
    if (importer?.startsWith("bucket-")) return 2;
    if (importer?.startsWith("wikitext-")) return 1;
    return 0;
}

/**
 * Keeps refresh checkpoints monotonic. A warning or transient metadata outage
 * must never replace a complete live table, and one partial refresh must not
 * shrink another partial table. The rejected candidate is still recorded as
 * a failure by the worker so maintenance runs retry it later.
 */
export function selectDropCheckpoint(
    previous: SnapshotRecord | undefined,
    candidate: SnapshotRecord,
): CheckpointSelection {
    // Apply deterministic safety migrations before comparing checkpoints. An
    // older complete record containing a conditionally guaranteed quest item
    // must never win merely because the corrected candidate omitted it.
    const safePrevious = previous
        ? omitUnsafeConditionalQuestDrops(previous).record
        : undefined;
    const safeCandidate = omitUnsafeConditionalQuestDrops(candidate).record;
    if (!safePrevious) return { record: safeCandidate };
    const candidateIsComplete =
        safeCandidate.importer === IMPORT_VERSION && safeCandidate.incomplete !== true;
    if (candidateIsComplete) return { record: safeCandidate };
    if (safePrevious.incomplete !== true) {
        return {
            record: safePrevious,
            rejectedCandidateReason:
                "incomplete refresh rejected; preserved the previous complete table",
        };
    }
    if (importerRank(safeCandidate.importer) < importerRank(safePrevious.importer)) {
        return {
            record: safePrevious,
            rejectedCandidateReason:
                `lower-quality ${safeCandidate.importer ?? "unknown"} refresh rejected; ` +
                `preserved ${safePrevious.importer ?? "existing"} checkpoint`,
        };
    }
    const previousEntries = countUsableSnapshotEntries(safePrevious);
    const candidateEntries = countUsableSnapshotEntries(safeCandidate);
    const previousKeys = snapshotEntryKeys(safePrevious);
    const candidateKeys = snapshotEntryKeys(safeCandidate);
    const missingPriorEntries = [...previousKeys].filter((key) => !candidateKeys.has(key));
    if (missingPriorEntries.length > 0) {
        return {
            record: safePrevious,
            rejectedCandidateReason:
                `partial refresh omitted ${missingPriorEntries.length} prior semantic entr${missingPriorEntries.length === 1 ? "y" : "ies"} ` +
                `(${previousEntries} to ${candidateEntries} usable rows); preserved the existing checkpoint`,
        };
    }
    return { record: safeCandidate };
}

function decodeBucketRows(rows: readonly BucketApiRow[]): { rows: ParsedBucketRow[]; errors: string[] } {
    const decoded: ParsedBucketRow[] = [];
    const errors: string[] = [];
    for (const row of rows) {
        if (!row.drop_json) continue;
        try {
            decoded.push({
                pageNameSub: String(row.page_name_sub ?? ""),
                rareDropTable: row.rare_drop_table === true,
                drop: JSON.parse(row.drop_json) as BucketDropJson,
            });
        } catch {
            errors.push("Bucket returned an invalid drop_json row");
        }
    }
    return { rows: decoded, errors };
}

/** Converts the Wiki's structured Bucket rows into the runtime's explicit pools. */
export function parseBucketDropTable(
    target: NpcTarget,
    rawRows: readonly BucketApiRow[],
    itemIdsByName: ReadonlyMap<string, number>,
    exactPageNameSub?: string,
    outcomeIds: ReadonlyMap<string, string> = new Map(),
    provenance: WikitextDropProvenance = { byItemName: new Map(), warnings: [] },
): { table?: ImportedTable; errors: string[] } {
    const decoded = decodeBucketRows(rawRows);
    const errors = [...decoded.errors, ...provenance.warnings];
    let rows = decoded.rows.filter(
        (row) => normalizeName(String(row.drop["Drop type"] ?? "combat")) === "combat",
    );

    if (exactPageNameSub?.includes("#")) {
        const exact = normalizeName(exactPageNameSub);
        const genericRows = rows.filter((row) => {
            const sub = normalizeName(row.pageNameSub || String(row.drop["Dropped from"] ?? ""));
            return !sub.includes("#");
        });
        const exactRows = rows.filter((row) => {
            const sub = normalizeName(row.pageNameSub || String(row.drop["Dropped from"] ?? ""));
            return sub === exact;
        });
        const hasVersionedRows = rows.some((row) => {
            const sub = normalizeName(row.pageNameSub || String(row.drop["Dropped from"] ?? ""));
            return sub.includes("#");
        });
        if (hasVersionedRows && exactRows.length === 0) {
            errors.push(`no Bucket rows matched exact NPC version '${exactPageNameSub}'`);
        }
        // Generic rows are shared by every version. Never retain rows for a
        // different explicit anchor when the requested anchor is absent.
        rows = [...genericRows, ...exactRows];
    }

    if (target.combatLevel && target.combatLevel > 0) {
        const levelRows = rows.filter((row) => {
            const levels = parseDropLevels(row.drop["Drop level"]);
            return levels.length === 0 || levels.includes(target.combatLevel!);
        });
        if (levelRows.length > 0) {
            rows = levelRows;
        } else if (rows.length > 0) {
            errors.push(`no Bucket rows matched combat level ${target.combatLevel}`);
        }
    }

    const versionKeys = new Set(
        rows
            .map((row) => normalizeName(row.pageNameSub))
            .filter((value) => value.includes("#")),
    );
    if (!exactPageNameSub?.includes("#") && versionKeys.size > 1) {
        errors.push(`ambiguous drop versions: ${[...versionKeys].join(", ")}`);
    }

    const always: DropEntry[] = [];
    const poolsByKey = new Map<string, DropPool>();
    const seen = new Set<string>();
    const ambiguousProvenanceWarnings = new Set<string>();
    const mainChainOrderByRolls = new Map<number, number>();
    for (const candidates of provenance.byItemName.values()) {
        for (const candidate of candidates) {
            if (candidate.preRollOrder === undefined) continue;
            mainChainOrderByRolls.set(
                candidate.rolls,
                Math.max(
                    mainChainOrderByRolls.get(candidate.rolls) ?? 0,
                    candidate.preRollOrder + 1,
                ),
            );
        }
    }
    const wildernessUniqueRolls = new Set<number>();
    for (const row of rows) {
        const rolls = Math.max(1, Math.trunc(Number(row.drop.Rolls) || 1));
        const sourceMetadata = resolveWikitextDropProvenance(
            provenance,
            String(row.drop["Dropped item"] ?? ""),
            String(row.drop.Rarity ?? ""),
            rolls,
        );
        if (
            sourceMetadata?.category === "unique" &&
            (sourceMetadata.wildernessRegion ||
                normalizeName(String(row.drop["League region"] ?? "")).includes("wilderness"))
        ) {
            wildernessUniqueRolls.add(rolls);
        }
    }
    const uniqueChainOrderByRolls = new Map<number, number>();
    for (const rolls of wildernessUniqueRolls) {
        const uniqueOrder = mainChainOrderByRolls.get(rolls) ?? 0;
        uniqueChainOrderByRolls.set(rolls, uniqueOrder);
        mainChainOrderByRolls.set(rolls, uniqueOrder + 1);
    }
    let warnedAboutUnique = false;
    for (const row of rows) {
        const rawName = String(row.drop["Dropped item"] ?? "").trim();
        if (!rawName || normalizeName(rawName) === "nothing") continue;
        if (normalizeName(rawName) === "key (medium)") {
            errors.push("conditional medium-clue key omitted until clue-step state is available");
            continue;
        }
        const itemId = resolveImportedItemId(rawName, itemIdsByName);
        if (itemId === undefined) {
            errors.push(`unmapped item '${rawName}'`);
            continue;
        }
        if (FROZEN_KEY_PIECE_ITEM_IDS.has(itemId)) {
            errors.push(FROZEN_KEY_PIECE_WARNING);
            continue;
        }
        const rarity = String(row.drop.Rarity ?? "").replace(/,/g, "").trim();
        if (!rarity) {
            errors.push(`missing rarity for '${rawName}'`);
            continue;
        }
        if (normalizeName(rarity) !== "always" && parseBucketProbability(rarity) === undefined) {
            errors.push(`unresolved rarity '${rarity}' for '${rawName}'`);
        }
        const quantity = normalizedBucketQuantity(row.drop);
        const outcomeId = outcomeIds.get(normalizeName(rawName));
        const contextual = contextualDropMetadata(rawName, row.drop, row.rareDropTable, errors);
        const rolls = Math.max(1, Math.trunc(Number(row.drop.Rolls) || 1));
        const sourceMetadata = resolveWikitextDropProvenance(
            provenance,
            rawName,
            rarity,
            rolls,
        );
        if (!sourceMetadata && provenance.byItemName.has(normalizeName(rawName))) {
            const warning = `ambiguous wikitext section provenance for '${rawName}'`;
            if (!ambiguousProvenanceWarnings.has(warning)) {
                errors.push(warning);
                ambiguousProvenanceWarnings.add(warning);
            }
        }
        const duplicateKey = `${itemId}:${quantity}:${rarity}:${contextual.altRarity ?? ""}:${row.rareDropTable}:${rolls}:${outcomeId ?? ""}:${sourceMetadata?.category ?? ""}:${sourceMetadata?.heading ?? ""}:${sourceMetadata?.preRollOrder ?? -1}`;
        if (seen.has(duplicateKey)) continue;
        seen.add(duplicateKey);
        const entry: DropEntry = {
            itemId,
            quantity,
            rarity,
            ...contextual,
            ...(outcomeId ? { outcomeId } : {}),
        };
        if (normalizeName(rarity) === "always") {
            always.push(entry);
            continue;
        }

        let category: DropPool["category"] = row.rareDropTable
            ? "shared"
            : isKnownIndependentDrop(rawName)
              ? "tertiary"
              : sourceMetadata?.category ?? "main";
        const wildernessUnique = category === "unique" && wildernessUniqueRolls.has(rolls);
        if (category === "unique" && !wildernessUnique && !warnedAboutUnique) {
            errors.push(
                "Unique section retained in the main roll because its pre-roll semantics are boss-specific",
            );
            warnedAboutUnique = true;
        }
        const kind = category === "tertiary" ? "independent" : "weighted";
        const preRollOrder = sourceMetadata?.preRollOrder;
        const mainChainOrder = mainChainOrderByRolls.get(rolls);
        const rollGroupId =
            category === "pre_roll" && preRollOrder !== undefined
                ? wikiPreRollGroupId(rolls, preRollOrder)
                : wildernessUnique
                  ? wikiUniqueRollGroupId(rolls)
                : category === "secondary"
                  ? wikiSecondaryRollGroupId(sourceMetadata?.heading ?? "secondary", rolls)
                  : wikiExclusiveRollGroupId(rolls);
        const rollChainOrder =
            category === "pre_roll"
                ? preRollOrder
                : wildernessUnique
                  ? uniqueChainOrderByRolls.get(rolls)
                : category !== "secondary" && kind === "weighted"
                  ? mainChainOrder
                  : undefined;
        const key = JSON.stringify([
            kind,
            category,
            rollGroupId,
            rolls,
            rollChainOrder ?? -1,
        ]);
        const pool = poolsByKey.get(key) ?? {
            kind,
            category,
            ...(kind === "weighted"
                ? {
                      rollGroupId,
                      ...(rollChainOrder !== undefined
                          ? {
                                rollChainId: wikiDropChainId(rolls),
                                rollChainOrder,
                            }
                          : {}),
                  }
                : {}),
            rolls,
            entries: [],
        };
        pool.entries.push(entry);
        poolsByKey.set(key, pool);
    }

    const weightedOutcomesByGroup = new Map<string, Map<string, number>>();
    let unbundledIndex = 0;
    for (const pool of poolsByKey.values()) {
        if (pool.kind !== "weighted") continue;
        const groupKey = JSON.stringify([
            pool.rollGroupId ?? `pool:${unbundledIndex}`,
            pool.rolls ?? 1,
            pool.rollChainId ?? "",
            pool.rollChainOrder ?? -1,
        ]);
        const weightedOutcomes = weightedOutcomesByGroup.get(groupKey) ?? new Map<string, number>();
        for (const entry of pool.entries) {
            const key = entry.outcomeId
                ? `bundle:${entry.outcomeId}`
                : `entry:${unbundledIndex++}`;
            weightedOutcomes.set(
                key,
                Math.max(
                    weightedOutcomes.get(key) ?? 0,
                    parseBucketProbability(entry.rarity) ?? 0,
                ),
            );
        }
        weightedOutcomesByGroup.set(groupKey, weightedOutcomes);
    }
    for (const weightedOutcomes of weightedOutcomesByGroup.values()) {
        const stageProbability = [...weightedOutcomes.values()].reduce(
            (sum, probability) => sum + probability,
            0,
        );
        if (stageProbability > 1.01) {
            errors.push(
                `exclusive drop probabilities total ${stageProbability.toFixed(4)}; ` +
                    "version or bundled-outcome metadata may be incomplete",
            );
        }
    }

    const pools = [...poolsByKey.values()];
    if (always.length === 0 && pools.length === 0) errors.push("no cache-backed Bucket rows");
    return { table: always.length > 0 || pools.length > 0 ? { always, pools } : undefined, errors };
}

const bucketRequests = new Map<string, Promise<BucketApiRow[]>>();
const wikitextRequests = new Map<string, Promise<ParsedWikiResponse>>();

function describeError(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (!cause) return error.message;
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    return `${error.message}: ${causeMessage}`;
}

async function fetchWithBackoff(
    url: URL,
    redirect: RequestRedirect = "follow",
): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
        let retryAfterMs = 0;
        try {
            const response = await fetch(url, {
                headers: { "user-agent": "xrsps-npc-drop-sync/2.0" },
                redirect,
            });
            if (response.status !== 429 && response.status < 500) return response;
            lastError = new Error(`HTTP ${response.status}`);
            const retryAfterSeconds = Number(response.headers.get("retry-after"));
            if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
                retryAfterMs = retryAfterSeconds * 1000;
            }
            // Drain failed responses so the connection can be safely reused.
            await response.arrayBuffer().catch(() => undefined);
        } catch (error) {
            lastError = error;
        }
        if (attempt === 5) break;
        const delayMs = Math.max(retryAfterMs, 1_000 * 2 ** attempt);
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error(`request failed after retry backoff: ${describeError(lastError)}`);
}

async function fetchBucketRows(pageName: string): Promise<BucketApiRow[]> {
    const key = normalizeName(pageName);
    const existing = bucketRequests.get(key);
    if (existing) return existing;
    const pending = (async () => {
        // rare_drop_table is queryable but the API does not reliably return it
        // as a selected value. Fetch both partitions and stamp the flag locally
        // so expanded RDT/GDT rows never consume the monster's normal drop roll.
        const fetchPartition = async (rareDropTable: boolean): Promise<BucketApiRow[]> => {
            const url = new URL(WIKI_API);
            const query =
                `bucket("dropsline").select("page_name_sub","drop_json")` +
                `.where("page_name",${JSON.stringify(pageName)})` +
                `.where("rare_drop_table",${rareDropTable}).limit(5000).run()`;
            url.searchParams.set("action", "bucket");
            url.searchParams.set("query", query);
            url.searchParams.set("format", "json");
            const response = await fetchWithBackoff(url);
            if (!response.ok) throw new Error(`Bucket HTTP ${response.status}`);
            const parsed = (await response.json()) as BucketApiResponse;
            if (parsed.error) {
                const message =
                    typeof parsed.error === "string"
                        ? parsed.error
                        : (parsed.error.info ?? JSON.stringify(parsed.error));
                throw new Error(`Bucket API: ${message}`);
            }
            const rows = Array.isArray(parsed.bucket) ? parsed.bucket : [];
            if (rows.length >= 5000) {
                throw new Error(
                    `Bucket ${rareDropTable ? "shared" : "normal"} partition reached the 5000-row limit`,
                );
            }
            return rows.map((row) => ({
                ...row,
                rare_drop_table: rareDropTable,
            }));
        };
        const [normalRows, sharedRows] = await Promise.all([
            fetchPartition(false),
            fetchPartition(true),
        ]);
        return [...normalRows, ...sharedRows];
    })();
    bucketRequests.set(key, pending);
    return pending;
}

async function resolveWikiLookup(target: NpcTarget): Promise<{ pageName: string; pageNameSub?: string }> {
    const url = new URL("https://oldschool.runescape.wiki/w/Special:Lookup");
    url.searchParams.set("type", "npc");
    url.searchParams.set("id", String(target.id));
    url.searchParams.set("name", target.name);
    // The lookup redirect carries the exact cache-version anchor in Location.
    // Following it with fetch can discard that fragment because URL hashes are
    // not part of the HTTP request, so inspect the redirect directly.
    const response = await fetchWithBackoff(url, "manual");
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
        await response.arrayBuffer().catch(() => undefined);
    } else if (!response.ok) {
        throw new Error(`Special:Lookup HTTP ${response.status}`);
    }
    const resolved = new URL(location ?? response.url, url);
    const rawTitle = resolved.pathname.startsWith("/w/") ? resolved.pathname.slice(3) : "";
    if (!rawTitle || rawTitle.toLowerCase().startsWith("special:lookup")) {
        return { pageName: target.name };
    }
    const pageName = decodeURIComponent(rawTitle).replace(/_/g, " ");
    const anchor = decodeURIComponent(resolved.hash.replace(/^#/, "")).replace(/_/g, " ");
    return { pageName, pageNameSub: anchor ? `${pageName}#${anchor}` : pageName };
}

async function fetchWikitext(pageName: string): Promise<ParsedWikiResponse> {
    const key = normalizeName(pageName);
    const existing = wikitextRequests.get(key);
    if (existing) return existing;
    const pending = (async () => {
        const url = new URL(WIKI_API);
        url.searchParams.set("action", "parse");
        url.searchParams.set("page", pageName);
        url.searchParams.set("prop", "wikitext");
        url.searchParams.set("format", "json");
        url.searchParams.set("redirects", "1");
        const response = await fetchWithBackoff(url);
        if (!response.ok) throw new Error(`Wikitext HTTP ${response.status}`);
        return (await response.json()) as ParsedWikiResponse;
    })();
    wikitextRequests.set(key, pending);
    return pending;
}

async function fetchNpcTable(
    target: NpcTarget,
    itemIdsByName: ReadonlyMap<string, number>,
): Promise<SnapshotRecord> {
    let pageName = target.name;
    let pageNameSub: string | undefined;
    const metadataWarnings: string[] = [];
    try {
        // Resolve every cache ID, even when a generic name has rows. Otherwise
        // common-name variants (standard/Catacombs/Wilderness, quest forms,
        // and so on) silently inherit one combined table.
        const lookup = await resolveWikiLookup(target);
        pageName = lookup.pageName;
        pageNameSub = lookup.pageNameSub;
    } catch (error) {
        metadataWarnings.push(`exact NPC lookup unavailable: ${describeError(error)}`);
    }

    const [bucketAttempt, wikitextAttempt] = await Promise.allSettled([
        fetchBucketRows(pageName),
        fetchWikitext(pageName),
    ]);
    const parsed = wikitextAttempt.status === "fulfilled" ? wikitextAttempt.value : undefined;
    const wikitext = parsed?.parse?.wikitext?.["*"];
    if (!wikitext) {
        const reason =
            wikitextAttempt.status === "rejected"
                ? describeError(wikitextAttempt.reason)
                : "page did not include source wikitext";
        metadataWarnings.push(`paired-outcome metadata unavailable: ${reason}`);
    }

    let bucketFailure: string | undefined;
    if (bucketAttempt.status === "fulfilled") {
        const result = parseBucketDropTable(
            target,
            bucketAttempt.value,
            itemIdsByName,
            pageNameSub,
            wikitext ? extractWikitextOutcomeIds(wikitext) : new Map(),
            wikitext
                ? extractWikitextDropProvenance(wikitext)
                : { byItemName: new Map(), warnings: [] },
        );
        result.errors.unshift(...metadataWarnings);
        if (result.table) {
            const omittedConditionalQuestRows = result.errors.filter(
                isSafeConditionalQuestOmission,
            ).length;
            const hasIncompleteErrors = result.errors.some(
                (error) => !isSafeConditionalQuestOmission(error),
            );
            return {
                npcTypeId: target.id,
                name: target.name,
                source: "wiki",
                sourcePage: pageNameSub ?? pageName,
                importer: IMPORT_VERSION,
                incomplete: hasIncompleteErrors || undefined,
                omittedConditionalQuestRows: omittedConditionalQuestRows || undefined,
                warnings: result.errors.length > 0 ? result.errors : undefined,
                table: result.table,
            };
        }
        bucketFailure = result.errors.join("; ");
    } else {
        bucketFailure = describeError(bucketAttempt.reason);
    }

    if (!parsed || !wikitext) {
        throw new Error(
            `structured import unavailable: ${bucketFailure ?? "no structured rows"}; ` +
                `wikitext fallback failed: ${metadataWarnings.join("; ")}`,
        );
    }
    const result = parseWikitextDropTable(wikitext, itemIdsByName);
    if (!result.table) throw new Error(result.errors.join("; "));
    if (bucketFailure) result.errors.unshift(`structured import unavailable: ${bucketFailure}`);
    const omittedConditionalQuestRows = result.errors.filter(
        isSafeConditionalQuestOmission,
    ).length;
    const hasIncompleteErrors = result.errors.some(
        (error) => !isSafeConditionalQuestOmission(error),
    );
    return {
        npcTypeId: target.id,
        name: target.name,
        source: "wiki",
        sourcePage: parsed.parse?.title ?? pageName,
        // Keep fallbacks retryable: only a Bucket-backed record is a complete
        // structured checkpoint for `--missing` maintenance runs.
        importer: WIKITEXT_FALLBACK_VERSION,
        incomplete: hasIncompleteErrors || undefined,
        omittedConditionalQuestRows: omittedConditionalQuestRows || undefined,
        warnings: result.errors.length > 0 ? result.errors : undefined,
        table: result.table,
    };
}

async function main(): Promise<void> {
    const { ids, all, missing, ifMissing, retryImportable, migrateSnapshot, help } = parseArguments(process.argv.slice(2));
    if (help) {
        console.log(IMPORTER_USAGE);
        return;
    }
    if (ifMissing && snapshotExists()) {
        console.log(`NPC Wiki drop snapshot already present: ${DESTINATION}`);
        return;
    }
    if (ifMissing) {
        console.warn(
            `[sync-npc-drops] No Wiki snapshot is present. Keeping the legacy bootstrap source; run ` +
                "pnpm --filter @august/server sync-npc-drops -- --all to build the current snapshot.",
        );
        return;
    }

    const prior = readSnapshot();
    if (migrateSnapshot) {
        const records = new Map<number, SnapshotRecord>();
        let changedRecords = 0;
        let changedEntries = 0;
        let changedRollTables = 0;
        let removedConditionalQuestEntries = 0;
        for (const previous of prior.records) {
            const migrated = migrateSnapshotRecord(previous);
            records.set(previous.npcTypeId, migrated.record);
            if (
                migrated.changedRestrictedEntries > 0 ||
                migrated.changedRollTable ||
                migrated.changedConditionalQuestMetadata
            ) {
                changedRecords++;
            }
            changedEntries += migrated.changedRestrictedEntries;
            if (migrated.changedRollTable) changedRollTables++;
            removedConditionalQuestEntries += migrated.removedConditionalQuestEntries;
        }
        if (changedRecords === 0) {
            console.log(`[sync-npc-drops] Snapshot migration is already current at ${DESTINATION}.`);
            return;
        }
        writeSnapshot(
            records,
            new Map(prior.failures.map((failure) => [failure.npcTypeId, failure])),
        );
        console.log(
            `[sync-npc-drops] Atomically hardened ${changedEntries} restricted rows and ` +
                `${changedRollTables} known pre-roll tables, and omitted ` +
                `${removedConditionalQuestEntries} unsafe conditional quest rows across ` +
                `${changedRecords} records at ${DESTINATION}.`,
        );
        return;
    }
    const combatLevels = loadCombatLevels();
    const cacheTargetsById = loadCacheNpcTargets(combatLevels);
    const spawnedTargetsById = loadSpawnTargets(combatLevels);
    const requestedIds =
        ids.length > 0
            ? ids
            : retryImportable
                ? prior.failures.map((failure) => failure.npcTypeId)
                : all
                    ? [...cacheTargetsById.keys()]
                    : [...spawnedTargetsById.keys()].filter((id) => cacheTargetsById.has(id));
    const existingRecords = new Map(prior.records.map((record) => [record.npcTypeId, record]));
    const unresolvedIds = new Set(prior.failures.map((failure) => failure.npcTypeId));
    const targetIds = missing && ids.length === 0
        // Old parsers cannot account for transcluded/shared tables. Only the
        // structured Bucket importer is a complete resumable checkpoint.
        ? requestedIds.filter((id) => {
              const record = existingRecords.get(id);
              return (
                  record?.importer !== IMPORT_VERSION ||
                  record.incomplete === true ||
                  (record.omittedConditionalQuestRows ?? 0) > 0 ||
                  unresolvedIds.has(id)
              );
          })
        : requestedIds;
    if (ids.length === 0 && !all && !retryImportable) {
        // The normal refresh remains scoped to live world spawns, but their
        // names come from the active cache. --all explicitly covers every
        // attackable/combat NPC definition in that cache.
        console.log(`[sync-npc-drops] Refreshing ${targetIds.length} spawned cache NPC IDs.`);
    }
    const targets = targetIds
        .map((id) => cacheTargetsById.get(id) ?? spawnedTargetsById.get(id))
        .filter((target): target is NpcTarget => target !== undefined);
    if (targets.length === 0) {
        if (missing && ids.length === 0) {
            console.log("[sync-npc-drops] Every requested NPC already has a structured checkpoint.");
            return;
        }
        throw new Error("No requested NPC IDs resolved from the active cache or generated spawn snapshot");
    }

    const records = new Map(prior.records.map((record) => [record.npcTypeId, record]));
    const failures = new Map(prior.failures.map((failure) => [failure.npcTypeId, failure]));
    const itemIdsByName = loadItemIdsByName();
    let next = 0;
    let processed = 0;
    const worker = async (): Promise<void> => {
        while (next < targets.length) {
            const target = targets[next++];
            try {
                const candidate = await fetchNpcTable(target, itemIdsByName);
                const selection = selectDropCheckpoint(records.get(target.id), candidate);
                records.set(target.id, selection.record);
                if (selection.rejectedCandidateReason) {
                    const warnings = candidate.warnings?.join("; ");
                    failures.set(target.id, {
                        npcTypeId: target.id,
                        name: target.name,
                        message: `${selection.rejectedCandidateReason}${warnings ? `: ${warnings}` : ""}`,
                    });
                } else if (selection.record.incomplete === true) {
                    failures.set(target.id, {
                        npcTypeId: target.id,
                        name: target.name,
                        message: `partial Wiki table retained for retry: ${selection.record.warnings?.join("; ") ?? "incomplete metadata"}`,
                    });
                } else {
                    failures.delete(target.id);
                }
            } catch (error) {
                failures.set(target.id, {
                    npcTypeId: target.id,
                    name: target.name,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            processed++;
            if (processed % 100 === 0) {
                writeSnapshot(records, failures);
                console.log(`[sync-npc-drops] checkpoint ${processed}/${targets.length}; tables=${records.size}; unresolved=${failures.size}`);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()));
    writeSnapshot(records, failures);
    console.log(
        `[sync-npc-drops] Saved ${records.size} exact-NPC Wiki tables; ${failures.size} unresolved NPCs are retained in diagnostics at ${DESTINATION}.`,
    );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
    void main().catch((error) => {
        console.error(`[sync-npc-drops] ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
