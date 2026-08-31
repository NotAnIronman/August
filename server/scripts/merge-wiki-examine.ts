/**
 * Regenerates server/data/npcs.json and server/data/locs.json as complete,
 * static, git-committable files — id, name, examine, actions — the same
 * pattern items.json already uses, loaded the same simple way (see
 * server/src/data/items.ts). No SQLite, no runtime wiring, no override
 * store. This is the file the server actually reads at runtime; the
 * examine_overrides SQLite table (::setexamine) is no longer part of the
 * bulk-data path — this file IS the data now.
 *
 * Run with: yarn --cwd server merge-wiki-examine
 *
 * Source data:
 *  - Local cache export (id/name/actions) from client/npcs/npcs.json and
 *    client/locs/locs.json (yarn --cwd client export-npcs / export-locs).
 *  - Wiki Bucket API for examine text (infobox_monster + infobox_npc for
 *    NPCs). Locs have no wiki bulk source (see import-examine-wiki.ts's
 *    findings) — locs.json is written with examine left blank, ready for
 *    manual entries later; this script won't silently claim loc coverage
 *    it doesn't have.
 */
import fs from "fs";
import path from "path";

const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const USER_AGENT = "xrsps-examine-importer/1.0 (private server tooling; contact via project repo)";
const PAGE_SIZE = 500;
const REQUEST_DELAY_MS = 1000;

interface LocalDefinition {
    id: number;
    name: string;
    actions?: (string | null)[];
}

interface OutputDefinition {
    id: number;
    name: string;
    examine: string;
    actions?: (string | null)[];
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBucketAll(bucketName: string, idField: string): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    let offset = 0;
    for (;;) {
        const query =
            `bucket('${bucketName}').select('${idField}','examine')` +
            `.limit(${PAGE_SIZE}).offset(${offset}).run()`;
        const url = `${WIKI_API}?action=bucket&format=json&query=${encodeURIComponent(query)}`;

        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) {
            console.error(`[merge-wiki-examine] bucket '${bucketName}' request failed: HTTP ${res.status}`);
            break;
        }
        const json = (await res.json()) as { bucket?: Array<Record<string, unknown>> };
        const page = json.bucket ?? [];

        for (const row of page) {
            const text = (row.examine as string | undefined)?.trim();
            if (!text) continue;
            const rawIds = row[idField];
            const ids = Array.isArray(rawIds) ? rawIds : rawIds !== undefined ? [rawIds] : [];
            for (const idVal of ids) {
                const id = Number(idVal);
                if (Number.isFinite(id) && id > 0) map.set(id, text);
            }
        }

        console.log(`[merge-wiki-examine] bucket '${bucketName}': fetched ${offset + page.length} rows so far...`);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
        await sleep(REQUEST_DELAY_MS);
    }
    return map;
}

function parseArgs(): { npcsSrc: string; locsSrc: string } {
    const args = process.argv.slice(2);
    const get = (flag: string, fallback: string) => {
        const found = args.find((a) => a.startsWith(`--${flag}=`));
        return found ? found.slice(flag.length + 3) : fallback;
    };
    return {
        npcsSrc: path.resolve(get("npcs", "../client/npcs/npcs.json")),
        locsSrc: path.resolve(get("locs", "../client/locs/locs.json")),
    };
}

async function buildNpcs(srcPath: string): Promise<OutputDefinition[]> {
    if (!fs.existsSync(srcPath)) {
        console.warn(`[merge-wiki-examine] ${srcPath} not found — run 'yarn --cwd client export-npcs' first. Skipping NPCs.`);
        return [];
    }
    const local = JSON.parse(fs.readFileSync(srcPath, "utf8")) as LocalDefinition[];

    const monsterMap = await fetchBucketAll("infobox_monster", "id");
    const npcMap = await fetchBucketAll("infobox_npc", "npc_id");
    const combined = new Map<number, string>([...monsterMap, ...npcMap]);

    let matched = 0;
    const out: OutputDefinition[] = local.map((d) => {
        const examine = combined.get(d.id) ?? "";
        if (examine) matched++;
        return { id: d.id, name: d.name, examine, actions: d.actions };
    });

    console.log(
        `[merge-wiki-examine] NPCs: ${matched}/${local.length} matched ` +
            `(${((matched / local.length) * 100) | 0}% coverage).`,
    );
    return out;
}

async function buildLocs(srcPath: string): Promise<OutputDefinition[]> {
    if (!fs.existsSync(srcPath)) {
        console.warn(`[merge-wiki-examine] ${srcPath} not found — run 'yarn --cwd client export-locs' first. Skipping locs.`);
        return [];
    }
    const local = JSON.parse(fs.readFileSync(srcPath, "utf8")) as LocalDefinition[];
    // No wiki bulk source exists for loc examine text (confirmed —
    // infobox_scenery has no examine field, no other bucket is a match).
    // Write the file anyway with empty examine strings so it's still a
    // complete, valid, git-diffable file ready for manual entries later —
    // never silently claim coverage that doesn't exist.
    const out: OutputDefinition[] = local.map((d) => ({
        id: d.id,
        name: d.name,
        examine: "",
        actions: d.actions,
    }));
    console.log(`[merge-wiki-examine] locs: ${local.length} written, 0 examine text (no wiki bulk source available).`);
    return out;
}

async function main() {
    const { npcsSrc, locsSrc } = parseArgs();

    const npcs = await buildNpcs(npcsSrc);
    if (npcs.length > 0) {
        const outPath = path.resolve(__dirname, "../data/npcs.json");
        fs.writeFileSync(outPath, JSON.stringify(npcs, null, 2) + "\n", "utf8");
        console.log(`[merge-wiki-examine] Wrote ${outPath}`);
    }

    const locs = await buildLocs(locsSrc);
    if (locs.length > 0) {
        const outPath = path.resolve(__dirname, "../data/locs.json");
        fs.writeFileSync(outPath, JSON.stringify(locs, null, 2) + "\n", "utf8");
        console.log(`[merge-wiki-examine] Wrote ${outPath}`);
    }

    console.log("[merge-wiki-examine] Done. Restart your server to pick these up.");
}

main().catch((err) => {
    console.error("[merge-wiki-examine] Failed:", err);
    process.exit(1);
});
