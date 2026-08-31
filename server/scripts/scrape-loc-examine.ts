/**
 * Fills in server/data/locs.json's examine text via two passes:
 *   1. Fast batch pass — up to 50 names per request via MediaWiki's
 *      action=query&prop=revisions, reading each page's raw wikitext for an
 *      `examine`/`examineN` template parameter. ~100 requests for ~5,100
 *      unique names, a couple minutes.
 *   2. Fallback pass — for names pass 1 couldn't match (complex/#switch/Lua
 *      multi-version infoboxes, e.g. Furnace), fetch the wiki's *rendered*
 *      HTML instead and read the infobox's "Examine" table row directly —
 *      works regardless of template complexity, but one request per name
 *      (no batching for rendered HTML), so meaningfully slower. Only runs
 *      on the leftover subset, not everything.
 *
 * This exists because, unlike items and NPCs, there is no wiki Bucket table
 * carrying loc examine text in bulk (confirmed — see merge-wiki-examine.ts's
 * header and docs/CLEANUP_ROADMAP.md).
 *
 * Run with: yarn --cwd server scrape-loc-examine [--limit=N] [--resume]
 *   --limit=N   stop after N unique names (useful for a quick test run first)
 *   --resume    skip names already present in the current locs.json output
 */
import fs from "fs";
import path from "path";

const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const USER_AGENT = "xrsps-examine-importer/1.0 (private server tooling; contact via project repo)";
const REQUEST_DELAY_MS = 1000;
const CHECKPOINT_EVERY_BATCHES = 5;
const BATCH_SIZE = 50;

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

/**
 * Pull an `examine` (or `examine1`, `examine2`, ...) parameter value out of
 * an infobox-style wikitext template. Handles the common single-version case
 * and takes the first version found for multi-version infoboxes. Doesn't
 * catch pages using #switch/Lua-computed infoboxes (e.g. Furnace) — those
 * fall through to the HTML-based fallback pass below.
 */
function extractExamineFromWikitext(wikitext: string): string | undefined {
    const patterns = [/\|\s*examine\s*=\s*([^\n|]+?)\s*(?:\n|\|)/i];
    for (let v = 1; v <= 9; v++) {
        patterns.push(new RegExp(`\\|\\s*examine${v}\\s*=\\s*([^\\n|]+?)\\s*(?:\\n|\\|)`, "i"));
    }
    for (const pattern of patterns) {
        const match = wikitext.match(pattern);
        if (match) {
            const value = match[1].trim();
            if (value && !/^(no|none|n\/a)$/i.test(value)) {
                return value;
            }
        }
    }
    return undefined;
}

/**
 * Fallback for names the wikitext-parameter search missed. Fetches the wiki's
 * rendered HTML for the page instead of raw markup, and reads the infobox's
 * "Examine" table row directly. This works regardless of how complicated the
 * underlying template logic is (#switch blocks, Lua modules, multi-version
 * infoboxes) since by the time it's rendered to HTML, it's just plain text
 * in a table cell. Slower — one request per name, no batching available for
 * rendered HTML — so only used for the subset the fast pass couldn't match.
 */
async function fetchExamineFromRenderedHtml(pageName: string): Promise<string | undefined> {
    const url =
        `${WIKI_API}?action=parse&prop=text&format=json&redirects=1` +
        `&page=${encodeURIComponent(pageName)}`;
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) return undefined;
        const json = (await res.json()) as { parse?: { text?: { "*"?: string } }; error?: unknown };
        if (json.error) return undefined;
        const html = json.parse?.text?.["*"];
        if (!html) return undefined;

        // Confirmed via diagnose-loc-html.ts against a real page: the infobox
        // renders as <td ... data-attr-param="examine">TEXT</td> — a stable
        // data attribute, not dependent on matching the visible "Examine"
        // label text. The first occurrence in the document is the default/
        // first version for multi-version pages (matches the convention used
        // by the wikitext-parameter pass).
        const match = html.match(/<td[^>]*\bdata-attr-param="examine"[^>]*>([\s\S]*?)<\/td>/i);
        if (!match) return undefined;
        const text = match[1]
            .replace(/<[^>]+>/g, "") // strip any nested tags (links, spans, etc.)
            .replace(/&#?\w+;/g, (entity) => decodeHtmlEntity(entity)) // basic entity decode
            .replace(/\s+/g, " ")
            .trim();
        return text && !/^(no|none|n\/a)$/i.test(text) ? text : undefined;
    } catch {
        return undefined;
    }
}

function decodeHtmlEntity(entity: string): string {
    const named: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    if (named[entity]) return named[entity];
    const numeric = entity.match(/&#(\d+);/);
    if (numeric) return String.fromCharCode(Number(numeric[1]));
    return entity;
}

interface QueryPage {
    title: string;
    missing?: unknown;
    revisions?: Array<{
        ["*"]?: string;
        slots?: { main?: { ["*"]?: string } };
    }>;
}

interface QueryResponse {
    query?: {
        pages?: Record<string, QueryPage>;
        normalized?: Array<{ from: string; to: string }>;
        redirects?: Array<{ from: string; to: string }>;
    };
    error?: unknown;
}

/** Fetches examine text for up to BATCH_SIZE names in a single request. */
async function fetchExamineBatch(names: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const url =
        `${WIKI_API}?action=query&prop=revisions&rvprop=content&rvslots=main` +
        `&redirects=1&format=json&titles=${encodeURIComponent(names.join("|"))}`;

    let json: QueryResponse;
    try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) {
            console.warn(`[scrape-loc-examine] batch request failed: HTTP ${res.status}`);
            return result;
        }
        json = (await res.json()) as QueryResponse;
    } catch (err) {
        console.warn(`[scrape-loc-examine] batch request errored:`, err);
        return result;
    }
    if (json.error) {
        console.warn(`[scrape-loc-examine] batch request returned an API error:`, json.error);
        return result;
    }

    // Map normalized/redirected titles back to the original name we asked
    // for, so results land under the key our local locs.json actually uses.
    const titleToOriginal = new Map<string, string>();
    for (const n of names) titleToOriginal.set(n, n);
    for (const norm of json.query?.normalized ?? []) {
        titleToOriginal.set(norm.to, titleToOriginal.get(norm.from) ?? norm.from);
    }
    for (const redir of json.query?.redirects ?? []) {
        const original = titleToOriginal.get(redir.from) ?? redir.from;
        titleToOriginal.set(redir.to, original);
    }

    const pages = json.query?.pages ?? {};
    for (const page of Object.values(pages)) {
        if (!page || page.missing !== undefined) continue;
        const originalName = titleToOriginal.get(page.title) ?? page.title;
        const rev = page.revisions?.[0];
        const content = rev?.slots?.main?.["*"] ?? rev?.["*"];
        if (!content) continue;
        const examine = extractExamineFromWikitext(content);
        if (examine) result.set(originalName, examine);
    }
    return result;
}

function parseArgs(): { limit: number | undefined; resume: boolean; locsSrc: string } {
    const args = process.argv.slice(2);
    const limitArg = args.find((a) => a.startsWith("--limit="));
    const locsFlag = args.find((a) => a.startsWith("--locs="));
    return {
        limit: limitArg ? Number(limitArg.slice("--limit=".length)) : undefined,
        resume: args.includes("--resume"),
        locsSrc: path.resolve(locsFlag ? locsFlag.slice("--locs=".length) : "../client/locs/locs.json"),
    };
}

async function main() {
    const { limit, resume, locsSrc } = parseArgs();
    const outPath = path.resolve(__dirname, "../data/locs.json");

    if (!fs.existsSync(locsSrc)) {
        console.error(`[scrape-loc-examine] ${locsSrc} not found — run 'yarn --cwd client export-locs' first.`);
        process.exit(1);
    }
    const local = JSON.parse(fs.readFileSync(locsSrc, "utf8")) as LocalDefinition[];

    const nameToExamine = new Map<string, string>();
    if (resume && fs.existsSync(outPath)) {
        const existing = JSON.parse(fs.readFileSync(outPath, "utf8")) as OutputDefinition[];
        for (const entry of existing) {
            if (entry.examine) nameToExamine.set(entry.name, entry.examine);
        }
        console.log(`[scrape-loc-examine] Resuming — ${nameToExamine.size} names already resolved.`);
    }

    const uniqueNames = Array.from(new Set(local.map((d) => d.name).filter((n) => n && n !== "null")));
    const toFetch = uniqueNames.filter((n) => !nameToExamine.has(n));
    const names = limit ? toFetch.slice(0, limit) : toFetch;

    const batches: string[][] = [];
    for (let i = 0; i < names.length; i += BATCH_SIZE) batches.push(names.slice(i, i + BATCH_SIZE));

    console.log(
        `[scrape-loc-examine] ${uniqueNames.length} unique names total, ${toFetch.length} still need fetching, ` +
            `processing ${names.length} names in ${batches.length} batch(es) this run.`,
    );

    let matched = 0;
    let processedBatches = 0;
    for (const batch of batches) {
        const results = await fetchExamineBatch(batch);
        for (const [name, examine] of results) {
            nameToExamine.set(name, examine);
            matched++;
        }
        processedBatches++;

        console.log(
            `[scrape-loc-examine] batch ${processedBatches}/${batches.length}: ` +
                `${results.size}/${batch.length} matched (running total: ${matched}).`,
        );

        if (processedBatches % CHECKPOINT_EVERY_BATCHES === 0) {
            writeOutput(local, nameToExamine, outPath);
            console.log(`[scrape-loc-examine] Checkpoint saved (${nameToExamine.size} names resolved so far).`);
        }

        if (processedBatches < batches.length) await sleep(REQUEST_DELAY_MS);
    }

    // Second pass: individual HTML-based fallback for names the fast
    // wikitext pass missed (complex/switch-based infoboxes, mainly).
    const stillUnresolved = names.filter((n) => !nameToExamine.has(n));
    if (stillUnresolved.length > 0) {
        console.log(
            `[scrape-loc-examine] Fast pass done (${matched} matched). Trying HTML fallback for ` +
                `${stillUnresolved.length} remaining names — this part is one request per name, slower.`,
        );
        let fallbackMatched = 0;
        for (let i = 0; i < stillUnresolved.length; i++) {
            const name = stillUnresolved[i];
            const examine = await fetchExamineFromRenderedHtml(name);
            if (examine) {
                nameToExamine.set(name, examine);
                fallbackMatched++;
                matched++;
            }
            if ((i + 1) % 25 === 0 || i + 1 === stillUnresolved.length) {
                console.log(
                    `[scrape-loc-examine] HTML fallback ${i + 1}/${stillUnresolved.length} ` +
                        `(matched ${fallbackMatched} this pass, ${matched} total).`,
                );
            }
            if ((i + 1) % (CHECKPOINT_EVERY_BATCHES * BATCH_SIZE) === 0) {
                writeOutput(local, nameToExamine, outPath);
                console.log(`[scrape-loc-examine] Checkpoint saved (${nameToExamine.size} names resolved so far).`);
            }
            if (i < stillUnresolved.length - 1) await sleep(REQUEST_DELAY_MS);
        }
    }

    writeOutput(local, nameToExamine, outPath);

    const totalMatched = local.filter((d) => nameToExamine.has(d.name)).length;
    console.log(
        `[scrape-loc-examine] Done. ${nameToExamine.size}/${uniqueNames.length} unique names resolved, ` +
            `covering ${totalMatched}/${local.length} loc ids (${((totalMatched / local.length) * 100) | 0}%). ` +
            `Wrote ${outPath}.`,
    );
    if (toFetch.length > names.length) {
        console.log(
            `[scrape-loc-examine] ${toFetch.length - names.length} names not yet attempted — ` +
                `run again with --resume to continue.`,
        );
    }
}

function writeOutput(local: LocalDefinition[], nameToExamine: Map<string, string>, outPath: string): void {
    const out: OutputDefinition[] = local.map((d) => ({
        id: d.id,
        name: d.name,
        examine: nameToExamine.get(d.name) ?? "",
        actions: d.actions,
    }));
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
}

main().catch((err) => {
    console.error("[scrape-loc-examine] Failed:", err);
    process.exit(1);
});

