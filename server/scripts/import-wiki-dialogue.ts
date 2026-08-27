import fs from "node:fs";
import path from "node:path";

import {
    parseWikiTranscript,
    type WikiTranscriptDraft,
} from "../src/game/dialogue/WikiTranscriptParser";

const API_URL = "https://oldschool.runescape.wiki/api.php";
const WIKI_URL = "https://oldschool.runescape.wiki/w/";
const DEFAULT_DELAY_MS = 500;
const DEFAULT_USER_AGENT =
    "August-dialogue-importer/1.0 (local development tool; contact the repository owner)";

interface CliOptions {
    pages: string[];
    all: boolean;
    limit?: number;
    npcId?: number;
    section?: string;
    outputDir: string;
    delayMs: number;
}

interface ApiParseResponse {
    parse?: {
        title: string;
        displaytitle: string;
        revid: number;
        wikitext: string;
    };
    error?: { code?: string; info?: string };
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    let pages = options.pages.map(normalizePageTitle);
    if (options.all) pages.push(...await discoverTranscriptPages(options.limit));
    pages = [...new Set(pages)];
    if (options.limit !== undefined) pages = pages.slice(0, options.limit);
    if (pages.length === 0) throw new Error("Use --page <name> (repeatable) or --all");
    if (options.npcId !== undefined && pages.length !== 1) {
        throw new Error("--npc-id can only be used with one transcript page");
    }

    fs.mkdirSync(options.outputDir, { recursive: true });
    let ready = 0;
    let needsReview = 0;
    let failed = 0;
    for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        try {
            const draft = await importPage(page, options);
            const filePath = path.join(options.outputDir, `${fileSlug(page)}.json`);
            fs.writeFileSync(filePath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
            const unresolved = draft.sections.reduce((sum, section) => sum + section.unresolved.length, 0);
            if (unresolved === 0) ready += 1;
            else needsReview += 1;
            console.log(
                `[dialogue-import] ${page} -> ${path.relative(process.cwd(), filePath)} ` +
                `(${draft.sections.length} sections, ${unresolved} unresolved hooks)`,
            );
        } catch (error) {
            failed += 1;
            console.error(`[dialogue-import] ${page} failed:`, error);
        }
        if (index + 1 < pages.length && options.delayMs > 0) await delay(options.delayMs);
    }
    console.log(`[dialogue-import] complete: ${ready} ready, ${needsReview} need review, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
}

async function importPage(pageTitle: string, options: CliOptions): Promise<WikiTranscriptDraft> {
    const params = new URLSearchParams({
        action: "parse",
        page: pageTitle,
        prop: "wikitext|revid|displaytitle",
        format: "json",
        formatversion: "2",
    });
    const response = await wikiFetch<ApiParseResponse>(params);
    if (!response.parse) {
        throw new Error(response.error?.info ?? `Wiki did not return '${pageTitle}'`);
    }
    const parsed = response.parse;
    return parseWikiTranscript(parsed.wikitext, {
        pageTitle: parsed.title,
        displayTitle: stripHtml(parsed.displaytitle),
        revisionId: parsed.revid,
        url: `${WIKI_URL}${encodeURIComponent(parsed.title).replace(/%3A/gi, ":").replace(/%20/g, "_")}`,
        retrievedAt: new Date().toISOString(),
    }, {
        suggestedNpcId: options.npcId,
        section: options.section,
    });
}

async function discoverTranscriptPages(limit?: number): Promise<string[]> {
    const pages: string[] = [];
    let continuation: string | undefined;
    do {
        const params = new URLSearchParams({
            action: "query",
            list: "categorymembers",
            cmtitle: "Category:NPC dialogue",
            cmnamespace: "0",
            cmlimit: "max",
            format: "json",
            formatversion: "2",
        });
        if (continuation) params.set("cmcontinue", continuation);
        const response = await wikiFetch<{
            query?: { categorymembers?: Array<{ title: string }> };
            continue?: { cmcontinue?: string };
        }>(params);
        pages.push(...(response.query?.categorymembers ?? []).map((page) => page.title));
        continuation = response.continue?.cmcontinue;
        if (limit !== undefined && pages.length >= limit) break;
        if (continuation) await delay(DEFAULT_DELAY_MS);
    } while (continuation);
    return limit === undefined ? pages : pages.slice(0, limit);
}

async function wikiFetch<T>(params: URLSearchParams): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
        const response = await fetch(`${API_URL}?${params}`, {
            headers: {
                "User-Agent": process.env.AUGUST_WIKI_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
                Accept: "application/json",
            },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`OSRS Wiki HTTP ${response.status} ${response.statusText}`);
        return await response.json() as T;
    } finally {
        clearTimeout(timeout);
    }
}

function parseArgs(args: readonly string[]): CliOptions {
    const options: CliOptions = {
        pages: [],
        all: false,
        outputDir: path.resolve(process.cwd(), "data/dialogue-imports"),
        delayMs: DEFAULT_DELAY_MS,
    };
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        const value = () => {
            const next = args[++index];
            if (!next) throw new Error(`${arg} needs a value`);
            return next;
        };
        if (arg === "--page") options.pages.push(value());
        else if (arg === "--all") options.all = true;
        else if (arg === "--limit") options.limit = positiveInteger(value(), "--limit");
        else if (arg === "--npc-id") options.npcId = positiveInteger(value(), "--npc-id");
        else if (arg === "--section") options.section = value();
        else if (arg === "--output-dir") options.outputDir = path.resolve(value());
        else if (arg === "--delay-ms") options.delayMs = nonNegativeInteger(value(), "--delay-ms");
        else if (arg === "--help" || arg === "-h") {
            console.log(
                "Usage: import-wiki-dialogue --page Man [--npc-id 3106] [--section 'Standard dialogue']\n" +
                "       import-wiki-dialogue --all [--limit 100] [--output-dir data/dialogue-imports]",
            );
            process.exit(0);
        } else throw new Error(`Unknown argument '${arg}'`);
    }
    return options;
}

function normalizePageTitle(value: string): string {
    const normalized = value.trim().replace(/_/g, " ");
    return /^transcript:/i.test(normalized) ? normalized : `Transcript:${normalized}`;
}

function fileSlug(pageTitle: string): string {
    return pageTitle
        .replace(/^Transcript:/i, "")
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "transcript";
}

function stripHtml(value: string): string {
    return value.replace(/<[^>]+>/g, "").trim();
}

function positiveInteger(value: string, flag: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
    return parsed;
}

function nonNegativeInteger(value: string, flag: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
    return parsed;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

void main();
