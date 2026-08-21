/**
 * Bulk-imports examine text from the OSRS wiki into examine_overrides.
 *
 * Background: this cache revision genuinely has no examine text for NPCs or
 * locs in the config data at all (confirmed exhaustively — see
 * docs/CLEANUP_ROADMAP.md and the examine investigation notes: 0/13032 NPCs
 * and 0/29405 locs found any, via both the standard decoder AND an
 * independent fresh-buffer re-scan). The wiki is the only real source for
 * this data on a private server.
 *
 * The wiki's Bucket API (https://oldschool.runescape.wiki/w/RuneScape:Bucket)
 * returns structured data in bulk. Its `id` field is REPEATED — one wiki
 * entry commonly maps to several real game ids at once (e.g. "Tz-Kih" ->
 * [2189, 2190, 3116, 3117]) — so we get the id-to-text mapping directly,
 * no name-matching heuristics needed.
 *
 * Combat-capable monsters and plain NPCs use separate wiki infobox
 * templates/buckets (`infobox_monster` with field `id`, `infobox_npc` with
 * field `npc_id` — confirmed by inspecting each bucket's schema page), so we
 * query both to cover the full NPC set.
 *
 * Locs are NOT covered by this script. Confirmed dead end: the canonical
 * scenery bucket (`infobox_scenery`) has no examine/name field at all — just
 * image, release, and an associated npc_id — and no other bucket in the
 * wiki's full bucket list is a plausible substitute (`infobox_location` is
 * unrelated geographic region data, not scenery objects). The wiki appears
 * to only carry loc examine text as prose inside each object's wiki article,
 * not in any queryable structured field. ::setexamine remains the path for
 * filling these in.
 *
 * Run with:
 *   yarn --cwd server import-examine-wiki
 *
 * Reads ../client/npcs/npcs.json and ../client/locs/locs.json by default
 * (wherever `yarn --cwd client export-npcs` / `export-locs` wrote them) —
 * override with --npcs=<path> / --locs=<path> if yours are elsewhere.
 */
import fs from "fs";
import path from "path";

import { ExamineOverrideStore } from "../src/game/examine/ExamineOverrideStore";
import { getGamemodeDataDir } from "../src/game/gamemodes/GamemodeRegistry";
import { getSqliteDatabase } from "../src/game/state/SqliteDatabase";

const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const USER_AGENT = "xrsps-examine-importer/1.0 (private server tooling; contact via project repo)";
const PAGE_SIZE = 500;
const REQUEST_DELAY_MS = 1000; // be polite — this is a shared community resource

interface BucketRow {
    id?: string[] | string;
    name?: string;
    examine?: string;
}

interface LocalDefinition {
    id: number;
    name: string;
}

function parseArgs(): { npcsPath: string; locsPath: string; targetGamemode: string } {
    const args = process.argv.slice(2);
    const get = (flag: string, fallback: string) => {
        const found = args.find((a) => a.startsWith(`--${flag}=`));
        return found ? found.slice(flag.length + 3) : fallback;
    };
    return {
        npcsPath: path.resolve(get("npcs", "../client/npcs/npcs.json")),
        locsPath: path.resolve(get("locs", "../client/locs/locs.json")),
        targetGamemode: get("gamemode", "vanilla"),
    };
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pulls every row from one bucket, paginating until a page comes back short. */
async function fetchBucketAll(bucketName: string, idField: string): Promise<BucketRow[]> {
    const rows: BucketRow[] = [];
    let offset = 0;
    for (;;) {
        const query =
            `bucket('${bucketName}').select('${idField}','examine')` +
            `.limit(${PAGE_SIZE}).offset(${offset}).run()`;
        const url = `${WIKI_API}?action=bucket&format=json&query=${encodeURIComponent(query)}`;

        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) {
            console.error(`[import-examine-wiki] bucket '${bucketName}' request failed: HTTP ${res.status}`);
            break;
        }
        const json = (await res.json()) as { bucket?: Array<Record<string, unknown>> };
        const page = (json.bucket ?? []).map((row) => ({
            id: row[idField] as string[] | string | undefined,
            examine: row.examine as string | undefined,
        }));
        rows.push(...page);

        console.log(`[import-examine-wiki] bucket '${bucketName}': fetched ${rows.length} rows so far...`);

        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
        await sleep(REQUEST_DELAY_MS);
    }
    return rows;
}

/** Flattens bucket rows into a plain {gameId: examineText} map. */
function buildIdTextMap(rows: BucketRow[]): Map<number, string> {
    const map = new Map<number, string>();
    for (const row of rows) {
        const text = row.examine?.trim();
        if (!text) continue;
        const ids = Array.isArray(row.id) ? row.id : row.id !== undefined ? [row.id] : [];
        for (const idStr of ids) {
            const id = Number(idStr);
            if (Number.isFinite(id) && id > 0) {
                map.set(id, text);
            }
        }
    }
    return map;
}

async function importKind(
    label: string,
    localPath: string,
    buckets: Array<{ name: string; idField: string }>,
    kind: "npc" | "loc",
    store: ExamineOverrideStore,
): Promise<void> {
    if (!fs.existsSync(localPath)) {
        console.warn(`[import-examine-wiki] Skipping ${label}: ${localPath} not found.`);
        return;
    }
    const local = JSON.parse(fs.readFileSync(localPath, "utf8")) as LocalDefinition[];
    const localIds = new Set(local.map((d) => d.id));

    const combined = new Map<number, string>();
    for (const { name: bucket, idField } of buckets) {
        const rows = await fetchBucketAll(bucket, idField);
        if (rows.length === 0) {
            console.warn(
                `[import-examine-wiki] bucket '${bucket}' (field '${idField}') returned 0 rows — ` +
                    `check https://oldschool.runescape.wiki/w/Bucket:${bucket
                        .split("_")
                        .map((w) => w[0].toUpperCase() + w.slice(1))
                        .join("_")} to confirm the real bucket/field name.`,
            );
        }
        const map = buildIdTextMap(rows);
        for (const [id, text] of map) combined.set(id, text);
    }

    let imported = 0;
    for (const [id, text] of combined) {
        if (!localIds.has(id)) continue; // only import ids that actually exist in our own cache export
        store.set(kind, id, text, "wiki-import");
        imported++;
    }

    console.log(
        `[import-examine-wiki] ${label}: ${combined.size} wiki entries found, ${imported} matched ` +
            `and imported (${local.length} total ${label} in local export, ` +
            `${(((imported / local.length) * 100) | 0)}% now covered).`,
    );
}

async function main() {
    const { npcsPath, locsPath, targetGamemode } = parseArgs();

    const database = getSqliteDatabase({ dataDir: getGamemodeDataDir(targetGamemode) });
    console.log(`[import-examine-wiki] Writing to database: ${database.databasePath}`);
    const store = new ExamineOverrideStore(database);

    await importKind(
        "NPCs",
        npcsPath,
        [
            { name: "infobox_monster", idField: "id" },
            { name: "infobox_npc", idField: "npc_id" },
        ],
        "npc",
        store,
    );

    // Locs: confirmed dead end for bulk import. infobox_scenery (the canonical
    // scenery bucket) has no examine/name field at all — just image, release,
    // and an associated npc_id. infobox_location is unrelated (geographic
    // regions like "Canifis", not individual scenery objects). No other
    // bucket in the wiki's full bucket list is a plausible match either.
    // Conclusion: the wiki doesn't structure loc examine text into Bucket at
    // all — it likely only exists as prose in each object's wiki article.
    // Bulk import isn't available for locs the way it is for items/NPCs;
    // ::setexamine remains the path for filling these in as they matter.
    if (fs.existsSync(locsPath)) {
        console.log(
            "[import-examine-wiki] Skipping locs: no wiki Bucket carries loc examine text " +
                "(confirmed — infobox_scenery has no examine field, infobox_location is unrelated " +
                "region data). Use ::setexamine loc <id> <text> for these instead.",
        );
    }

    console.log("[import-examine-wiki] Done. Restart your server (or it'll pick these up live via ::setexamine's cache) to see them in-game.");
}

main().catch((err) => {
    console.error("[import-examine-wiki] Failed:", err);
    process.exit(1);
});
