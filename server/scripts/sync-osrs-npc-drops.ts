/**
 * Refreshes cache-NPC drop tables from the OSRS Wiki's source DropsLine data.
 *
 * The legacy OSRSBox export is retained as a bootstrap fallback, but it ends
 * at an old cache revision.  This importer writes exact cache NPC IDs into a
 * checkpointed snapshot so current NPCs never depend on a name-only join.
 * A page with verified cache-backed rows is published as a marked baseline;
 * unmapped or dynamic rows are retained as warnings for a later accuracy pass.
 *
 * Usage:
 *   yarn --cwd server sync-npc-drops                 # refresh every spawned NPC
 *   yarn --cwd server sync-npc-drops -- --npc 2215   # refresh one NPC
 *   yarn --cwd server sync-npc-drops -- --all
 *   yarn --cwd server sync-npc-drops -- --all --missing # resumable full import
 *   yarn --cwd server ensure-npc-drops               # retain legacy bootstrap if no snapshot yet
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { CacheInfo } from "../../client/rs/cache/CacheInfo";
import { CacheSystem } from "../../client/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../client/rs/cache/loader/CacheLoaderFactory";
import { loadCache, loadCacheInfos } from "../../client/scripts/cache/load-util";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const ITEMS_PATH = path.join(ROOT, "server", "data", "items.json");
const SPAWNS_PATH = path.join(ROOT, "server", "data", "npc-spawns.json");
// Runtime data must live under server/data. `references/` is deliberately
// ignored, so a server launched from a different working directory can have
// a perfectly good import beside it but no tables at runtime.
const DESTINATION = path.join(ROOT, "server", "data", "npc-drops-wiki.json");
const LEGACY_DESTINATION = path.join(ROOT, "references", "npc-drops-wiki.json");
const TARGET_PATH = path.join(ROOT, "server", "target.txt");
const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const CONCURRENCY = 5;
const WIKITEXT_IMPORT_VERSION = "wikitext-v1";
// Names that changed on the Wiki while their cache object name remains the
// established in-client spelling. Keep this list explicit and reviewable;
// never fall back to fuzzy matching for drop items.
const ITEM_NAME_ALIASES = new Map<string, string>([
    ["rune javelin tips", "rune javelin heads"],
    ["dragon javelin tips", "dragon javelin heads"],
]);
const ITEM_NAME_ID_OVERRIDES = new Map<string, number>([
    ["temple key (desert treasure ii)", 28389],
]);

type Spawn = { id?: number; name?: string };
type NpcTarget = { id: number; name: string };
type LocalItem = { id: number; name?: string; noted?: boolean };
type DropEntry = { itemId: number; quantity: string; rarity: string };
type DropPool = {
    kind: "weighted" | "independent";
    category: "main" | "tertiary" | "weapons_armour" | "runes_ammo" | "coins" | "other";
    rolls?: number;
    entries: DropEntry[];
};
type ImportedTable = { always?: DropEntry[]; pools?: DropPool[] };
type SnapshotRecord = {
    npcTypeId: number;
    name: string;
    source: "wiki";
    sourcePage: string;
    importer?: typeof WIKITEXT_IMPORT_VERSION;
    /** The table has usable cache-backed rows, but the Wiki page also had rows
     * that need a later item-alias or special-table pass. */
    incomplete?: boolean;
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
type ParsedWikiResponse = { parse?: { title?: string; wikitext?: { "*"?: string } } };
type ParsedRow = { itemId: number; quantity: string; rarity: string };
type ParsedWikitextRow = ParsedRow & { rolls: number };

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
} {
    const ids: number[] = [];
    for (let index = 0; index < args.length; index++) {
        if (args[index] !== "--npc") continue;
        const id = Number(args[index + 1]);
        if (!Number.isInteger(id) || id < 0) throw new Error("--npc requires a non-negative cache NPC ID");
        ids.push(id);
    }
    if (args.some((arg, index) => arg.startsWith("--") && !["--npc", "--all", "--missing", "--if-missing", "--retry-importable"].includes(arg) && args[index - 1] !== "--npc")) {
        throw new Error("Usage: sync-npc-drops [--npc id] [--all] [--missing] [--if-missing] [--retry-importable]");
    }
    return {
        ids: [...new Set(ids)],
        all: args.includes("--all"),
        missing: args.includes("--missing"),
        ifMissing: args.includes("--if-missing"),
        retryImportable: args.includes("--retry-importable"),
    };
}

function loadSpawnTargets(): Map<number, string> {
    const parsed = JSON.parse(fs.readFileSync(SPAWNS_PATH, "utf8")) as Spawn[];
    if (!Array.isArray(parsed)) throw new Error("server/data/npc-spawns.json must contain an array");
    const targets = new Map<number, string>();
    for (const spawn of parsed) {
        const id = Number(spawn.id);
        const name = String(spawn.name ?? "").trim();
        if (!Number.isInteger(id) || id < 0 || !name || name.toLowerCase() === "null") continue;
        if (!targets.has(id)) targets.set(id, name);
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
            `Target cache '${target}' is not listed in server/caches/caches.json. ` +
                "Run yarn --cwd server ensure-cache first.",
        );
    }
    return cacheInfo;
}

/**
 * The active cache is the only authoritative mapping from an NPC ID to its
 * Wiki page name. Spawn JSON is a world-placement list, not an NPC-definition
 * catalogue; using it for --npc made valid live IDs impossible to import.
 */
function loadCacheNpcTargets(): Map<number, string> {
    const cacheInfo = resolveTargetCacheInfo();
    const loaded = loadCache(cacheInfo);
    const cacheSystem = CacheSystem.fromFiles(loaded.type, loaded.files);
    const npcTypeLoader = getCacheLoaderFactory(cacheInfo, cacheSystem).getNpcTypeLoader();
    const targets = new Map<number, string>();
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
            targets.set(id, name);
        } catch {
            // Some cache indices expose trailing unreadable definitions.
        }
    }
    return targets;
}

function installLegacySnapshotIfNeeded(): boolean {
    if (fs.existsSync(DESTINATION)) return true;
    if (!fs.existsSync(LEGACY_DESTINATION)) return false;
    fs.mkdirSync(path.dirname(DESTINATION), { recursive: true });
    fs.copyFileSync(LEGACY_DESTINATION, DESTINATION);
    console.log(`[sync-npc-drops] Installed runtime snapshot at ${DESTINATION}.`);
    return true;
}

function loadItemIdsByName(): Map<string, number> {
    const items = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LocalItem[];
    if (!Array.isArray(items)) throw new Error("server/data/items.json must contain an array");
    const candidates = new Map<string, LocalItem[]>();
    for (const item of items) {
        const name = item.name?.trim();
        if (!name || name.toLowerCase() === "null") continue;
        const key = normalizeName(name);
        const bucket = candidates.get(key) ?? [];
        bucket.push(item);
        candidates.set(key, bucket);
    }
    const out = new Map<string, number>([["coins", 995]]);
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
        source: "https://oldschool.runescape.wiki/ (action=parse wikitext DropsLine records)",
        records: [...records.values()].sort((left, right) => left.npcTypeId - right.npcTypeId),
        failures: [...failures.values()].sort((left, right) => left.npcTypeId - right.npcTypeId),
    };
    fs.mkdirSync(path.dirname(DESTINATION), { recursive: true });
    fs.writeFileSync(DESTINATION, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function categoryForHeading(heading: string): DropPool["category"] {
    const normalized = normalizeName(heading).replace(/_/g, " ");
    if (normalized.includes("tertiary")) return "tertiary";
    if (normalized.includes("weapon") || normalized.includes("armour") || normalized.includes("armor")) return "weapons_armour";
    if (normalized.includes("rune") || normalized.includes("ammo") || normalized.includes("ammunition")) return "runes_ammo";
    if (normalized.includes("coin")) return "coins";
    if (normalized === "other") return "other";
    return "main";
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

function parsePositiveInteger(value: string | undefined): number {
    const parsed = Number.parseInt(stripWikitext(value ?? ""), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseWikitextRows(
    source: string,
    heading: string,
    itemIdsByName: ReadonlyMap<string, number>,
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
        const rarity = stripWikitext(template.args.get("rarity") ?? "");
        if (!rarity || rarity.includes("{{")) {
            errors.push(`${heading}: unresolved rarity for '${rawName}'`);
            continue;
        }
        rows.push({
            itemId,
            quantity: stripWikitext(template.args.get("quantity") ?? "1").replace(/,/g, "") || "1",
            rarity,
            rolls: parsePositiveInteger(template.args.get("rolls")),
        });
    }
    return { rows, errors };
}

function parseWikitextDropTable(
    source: string,
    itemIdsByName: ReadonlyMap<string, number>,
): { table?: ImportedTable; errors: string[] } {
    const section = extractWikitextDropSection(source);
    if (!section) return { errors: ["page has no Drops section"] };
    const headings = [...section.matchAll(/^={3,}\s*(.*?)\s*=+\s*$/gm)];
    const sections =
        headings.length > 0
            ? headings.map((match, index) => ({
                  heading: stripWikitext(match[1]),
                  body: section.slice(
                      match.index! + match[0].length,
                      index + 1 < headings.length ? headings[index + 1].index! : section.length,
                  ),
              }))
            : [{ heading: "Main drops", body: section }];
    const always: DropEntry[] = [];
    const poolsByKey = new Map<string, DropPool>();
    const errors: string[] = [];
    for (const subsection of sections) {
        const parsed = parseWikitextRows(subsection.body, subsection.heading, itemIdsByName);
        errors.push(...parsed.errors);
        if (parsed.rows.length === 0) continue;
        const alwaysHeading = normalizeName(subsection.heading) === "100%";
        for (const row of parsed.rows) {
            if (alwaysHeading || normalizeName(row.rarity) === "always") {
                always.push({ itemId: row.itemId, quantity: row.quantity, rarity: "Always" });
                continue;
            }
            const category = categoryForHeading(subsection.heading);
            const kind = category === "tertiary" ? "independent" : "weighted";
            const key = `${kind}:${category}:${row.rolls}`;
            const pool = poolsByKey.get(key) ?? { kind, category, rolls: row.rolls, entries: [] };
            pool.entries.push({ itemId: row.itemId, quantity: row.quantity, rarity: row.rarity });
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

async function fetchNpcTable(
    npcTypeId: number,
    name: string,
    itemIdsByName: ReadonlyMap<string, number>,
): Promise<SnapshotRecord> {
    const url = new URL(WIKI_API);
    url.searchParams.set("action", "parse");
    url.searchParams.set("page", name);
    url.searchParams.set("prop", "wikitext");
    url.searchParams.set("format", "json");
    url.searchParams.set("redirects", "1");
    let response: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
        const candidate = await fetch(url, { headers: { "user-agent": "xrsps-npc-drop-sync/1.0" } });
        if (candidate.status !== 429) {
            response = candidate;
            break;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
    if (!response) throw new Error("HTTP 429 after retry backoff");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = (await response.json()) as ParsedWikiResponse;
    const wikitext = parsed.parse?.wikitext?.["*"];
    if (!wikitext) throw new Error("page did not include source wikitext");
    const result = parseWikitextDropTable(wikitext, itemIdsByName);
    if (!result.table) throw new Error(result.errors.join("; "));
    return {
        npcTypeId,
        name,
        source: "wiki",
        sourcePage: parsed.parse?.title ?? name,
        importer: WIKITEXT_IMPORT_VERSION,
        incomplete: result.errors.length > 0 || undefined,
        warnings: result.errors.length > 0 ? result.errors : undefined,
        table: result.table,
    };
}

async function main(): Promise<void> {
    const { ids, all, missing, ifMissing, retryImportable } = parseArguments(process.argv.slice(2));
    if (ifMissing && installLegacySnapshotIfNeeded()) {
        console.log(`NPC Wiki drop snapshot already present: ${DESTINATION}`);
        return;
    }
    if (ifMissing) {
        console.warn(
            `[sync-npc-drops] No Wiki snapshot is present. Keeping the legacy bootstrap source; run ` +
                "yarn --cwd server sync-npc-drops -- --all to build the current, checkpointed snapshot.",
        );
        return;
    }

    const prior = readSnapshot();
    const cacheTargetsById = loadCacheNpcTargets();
    const spawnedTargetsById = loadSpawnTargets();
    const requestedIds =
        ids.length > 0
            ? ids
            : retryImportable
                ? prior.failures
                      .filter(
                          (failure) =>
                              failure.message.startsWith("HTTP 429") ||
                              failure.message.includes("unmapped item 'Nothing'"),
                      )
                      .map((failure) => failure.npcTypeId)
                : all
                    ? [...cacheTargetsById.keys()]
                    : [...spawnedTargetsById.keys()];
    const existingRecords = new Map(prior.records.map((record) => [record.npcTypeId, record]));
    const targetIds = missing && ids.length === 0
        // Records made by the old rendered-HTML parser are intentionally
        // retried once; only a raw-wikitext record is a resumable checkpoint.
        ? requestedIds.filter((id) => existingRecords.get(id)?.importer !== WIKITEXT_IMPORT_VERSION)
        : requestedIds;
    if (ids.length === 0 && !all && !retryImportable) {
        // The normal refresh remains scoped to live world spawns, but their
        // names come from the active cache. --all explicitly covers every
        // attackable/combat NPC definition in that cache.
        console.log(`[sync-npc-drops] Refreshing ${targetIds.length} spawned cache NPC IDs.`);
    }
    const targets = targetIds.map((id) => ({
        id,
        name: cacheTargetsById.get(id) ?? spawnedTargetsById.get(id),
    })).filter(
        (target): target is NpcTarget => Boolean(target.name),
    );
    if (targets.length === 0) {
        if (missing && ids.length === 0) {
            console.log("[sync-npc-drops] Every requested NPC already has a raw-wikitext checkpoint.");
            return;
        }
        throw new Error("No requested NPC IDs resolved from the active cache or server/data/npc-spawns.json");
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
                const record = await fetchNpcTable(target.id, target.name, itemIdsByName);
                records.set(target.id, record);
                failures.delete(target.id);
            } catch (error) {
                failures.set(target.id, {
                    npcTypeId: target.id,
                    name: target.name,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            processed++;
            if (processed % 25 === 0) {
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

void main().catch((error) => {
    console.error(`[sync-npc-drops] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
