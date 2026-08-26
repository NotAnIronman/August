/**
 * Generates the UIKit skill-guide data from the OSRS Wiki's public
 * `Skill/Level up table` pages. Generated descriptions retain a source
 * header in every file so the public source and the refresh process stay
 * explicit instead of creating untraceable hand-copied tables.
 *
 * The importer is intentionally not run during world startup: content
 * imports are an explicit developer action, never a login-time network
 * dependency. It leaves a skill's existing file untouched if that page
 * cannot be read or parsed.
 *
 * Usage:
 *   yarn --cwd server sync-wiki-skill-guides
 *   yarn --cwd server sync-wiki-skill-guides --dry-run
 *   yarn --cwd server sync-wiki-skill-guides -- --skill fishing
 *   yarn --cwd server sync-wiki-skill-guides --source-dir ../references/skill-guide
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ITEMS_PATH = path.resolve(SCRIPT_DIR, "../data/items.json");
const DATA_DIR = path.resolve(SCRIPT_DIR, "../gamemodes/vanilla/skillGuide/data");
const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const MAX_ENTRIES_PER_TAB = 90;

const SKILLS = [
    ["attack", "Attack", "Attack"],
    ["strength", "Strength", "Strength"],
    ["defence", "Defence", "Defence"],
    ["ranged", "Ranged", "Ranged"],
    ["prayer", "Prayer", "Prayer"],
    ["magic", "Magic", "Magic"],
    ["runecraft", "Runecraft", "Runecraft"],
    ["construction", "Construction", "Construction"],
    ["hitpoints", "Hitpoints", "Hitpoints"],
    ["agility", "Agility", "Agility"],
    ["herblore", "Herblore", "Herblore"],
    ["thieving", "Thieving", "Thieving"],
    ["crafting", "Crafting", "Crafting"],
    ["fletching", "Fletching", "Fletching"],
    ["slayer", "Slayer", "Slayer"],
    ["hunter", "Hunter", "Hunter"],
    ["mining", "Mining", "Mining"],
    ["smithing", "Smithing", "Smithing"],
    ["fishing", "Fishing", "Fishing"],
    ["cooking", "Cooking", "Cooking"],
    ["firemaking", "Firemaking", "Firemaking"],
    ["woodcutting", "Woodcutting", "Woodcutting"],
    ["farming", "Farming", "Farming"],
    ["sailing", "Sailing", "Sailing"],
] as const;

type LocalItem = { id: number; name?: string };
type GuideEntry = {
    itemId: number;
    level: number;
    name: string;
    description?: string;
    requires?: string[];
};
type GuideTab = { label: string; entries: GuideEntry[] };
type ParsedWikiResponse = { parse?: { wikitext?: { "*"?: string } } };

function normalizeName(value: string): string {
    return value
        .toLowerCase()
        .replace(/\([^)]*\)/g, "")
        .replace(/[^a-z0-9]+/g, "")
        .trim();
}

function buildItemIdsByName(): Map<string, number> {
    const parsed = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LocalItem[];
    const out = new Map<string, number>();
    for (const item of parsed) {
        const name = item.name?.trim();
        if (!name || name.toLowerCase() === "null") continue;
        const key = normalizeName(name);
        if (key && !out.has(key)) out.set(key, item.id);
    }
    return out;
}

function parseArguments(args: readonly string[]): {
    dryRun: boolean;
    sourceDir?: string;
    skill?: string;
} {
    const dryRun = args.includes("--dry-run");
    const sourceIndex = args.indexOf("--source-dir");
    const skillIndex = args.indexOf("--skill");
    const sourceDir = sourceIndex < 0 ? undefined : args[sourceIndex + 1]?.trim();
    const skill = skillIndex < 0 ? undefined : args[skillIndex + 1]?.trim().toLowerCase();
    if (sourceIndex >= 0 && !sourceDir) throw new Error("--source-dir requires a directory path");
    if (skillIndex >= 0 && !skill) throw new Error("--skill requires a skill file key");
    if (skill && !SKILLS.some(([fileKey]) => fileKey === skill)) {
        throw new Error(`Unknown skill '${skill}'. Use one of: ${SKILLS.map(([fileKey]) => fileKey).join(", ")}`);
    }
    return { dryRun, sourceDir: sourceDir ? path.resolve(sourceDir) : undefined, skill };
}

function cleanWikitext(value: string): string {
    let text = value;
    // Prefer the page's intended short label (txt=) and its chosen icon name
    // (pic=) over verbose template markup.
    text = text.replace(/\{\{plink\|([^{}]*?)\}\}/gi, (_match, body: string) => {
        const parts = body.split("|");
        const txt = parts.find((part) => part.startsWith("txt="))?.slice(4);
        const pic = parts.find((part) => part.startsWith("pic="))?.slice(4);
        return txt || pic || parts[0]?.split("#")[0] || "";
    });
    text = text.replace(/\{\{SCP\|([^|}]+)(?:\|([^}]+))?\}\}/gi, (_match, skill, level) =>
        level ? `${skill} ${level}` : skill,
    );
    text = text.replace(/\{\{[^{}]*\}\}/g, "");
    text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) =>
        String(label || target).split("#")[0],
    );
    text = text.replace(/''+/g, "").replace(/<[^>]*>/g, "");
    return text.replace(/\s+/g, " ").trim();
}

function itemIdForWikitext(raw: string, itemIds: ReadonlyMap<string, number>): number {
    const plink = /\{\{plink\|([^{}]*?)\}\}/i.exec(raw)?.[1] ?? "";
    const parts = plink.split("|");
    const candidate =
        parts.find((part) => part.startsWith("pic="))?.slice(4) ??
        parts[0]?.split("#")[0] ??
        cleanWikitext(raw);
    return itemIds.get(normalizeName(candidate)) ?? -1;
}

/** Moves a wiki's trailing "(with …)" clause into the guide's dedicated
 * requirement line. The renderer evaluates recognised skill-level clauses;
 * other requirements remain visible as neutral reference text. */
function splitEntryRequirements(text: string): { name: string; requires?: string[] } {
    const match = /^(.*?)\s+\(with\s+(.+)\)$/i.exec(text.trim());
    if (!match) return { name: text };
    const name = match[1].trim();
    const requirement = match[2].trim();
    return name && requirement ? { name, requires: [requirement] } : { name: text };
}

function collectRows(
    wikitext: string,
    group: "freeplay" | "members",
    itemIds: ReadonlyMap<string, number>,
): GuideEntry[] {
    const sections = new Map<number, string[]>();
    const pattern = new RegExp(
        String.raw`^\|${group}(all|\d+)\s*=\s*([\s\S]*?)(?=^\|(freeplay|members)(?:all|\d+)\s*=|^\}\})`,
        "gmi",
    );
    for (const match of wikitext.matchAll(pattern)) {
        const level = match[1].toLowerCase() === "all" ? 1 : Number(match[1]);
        const rows = sections.get(level) ?? [];
        for (const rawLine of match[2].split(/\r?\n/)) {
            if (!/^\*+\s+/.test(rawLine)) continue;
            const raw = rawLine.replace(/^\*+\s+/, "").trim();
            const text = cleanWikitext(raw);
            if (!text) continue;
            // The skill guide is a training-unlock reference. Quest and
            // achievement-diary requirements belong in their own journals,
            // not as rows in this panel (matching the live interface).
            if (/\b(?:mini)?quests?\b|\bdiar(?:y|ies)\b/i.test(text)) continue;
            rows.push(JSON.stringify({ raw, text }));
        }
        sections.set(level, rows);
    }

    const output: GuideEntry[] = [];
    for (const [level, serialized] of [...sections.entries()].sort((a, b) => a[0] - b[0])) {
        for (const encoded of serialized) {
            const { raw, text } = JSON.parse(encoded) as { raw: string; text: string };
            const entry = splitEntryRequirements(text);
            output.push({
                itemId: itemIdForWikitext(raw, itemIds),
                level,
                // Keep an individual UIKit row readable; details such as a
                // quest requirement use the second text line instead of
                // allowing a giant line to overflow the panel.
                name: entry.name.slice(0, 96),
                ...(entry.requires ? { requires: entry.requires } : {}),
                ...(entry.name.length > 96 ? { description: entry.name.slice(96, 210) } : {}),
            });
        }
    }
    return output;
}

function chunkTabs(label: string, entries: readonly GuideEntry[]): GuideTab[] {
    const tabs: GuideTab[] = [];
    for (let offset = 0; offset < entries.length; offset += MAX_ENTRIES_PER_TAB) {
        const number = Math.floor(offset / MAX_ENTRIES_PER_TAB) + 1;
        tabs.push({
            label: entries.length > MAX_ENTRIES_PER_TAB ? `${label} ${number}` : label,
            entries: entries.slice(offset, offset + MAX_ENTRIES_PER_TAB),
        });
    }
    return tabs;
}

function generateFile(skillId: string, tabs: readonly GuideTab[]): string {
    return `// Generated by scripts/sync-wiki-skill-guides.ts from the OSRS Wiki's public\n` +
        `// ${skillId}/Level_up_table page. Refresh deliberately; do not hand-edit.\n` +
        `import { SkillId } from "../../../../../client/rs/skill/skills";\n` +
        `import type { SkillGuideData } from "../types";\n\n` +
        `export const ${skillId.toLowerCase()}SkillGuide: SkillGuideData = ${JSON.stringify(
            { skillId: `__SKILL_${skillId}__`, tabs },
            null,
            4,
        )
            .replace('"__SKILL_' + skillId + '__"', `SkillId.${skillId}`)
            .replace(/\"([^\"]+)\":/g, "$1:")};\n`;
}

async function loadWikitext(
    fileKey: string,
    wikiPage: string,
    sourceDir: string | undefined,
): Promise<string> {
    if (sourceDir) {
        const sourcePath = path.join(sourceDir, `${fileKey}.wikitext`);
        return fs.readFileSync(sourcePath, "utf8");
    }
    const url = new URL(WIKI_API);
    url.searchParams.set("action", "parse");
    url.searchParams.set("page", `${wikiPage}/Level up table`);
    url.searchParams.set("prop", "wikitext");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = (await response.json()) as ParsedWikiResponse;
    const text = parsed.parse?.wikitext?.["*"];
    if (!text) throw new Error("page did not include wikitext");
    return text;
}

async function main(): Promise<void> {
    const { dryRun, sourceDir, skill } = parseArguments(process.argv.slice(2));
    const itemIds = buildItemIdsByName();
    let generated = 0;
    let entries = 0;
    const requestedSkills = skill ? SKILLS.filter(([fileKey]) => fileKey === skill) : SKILLS;
    for (const [fileKey, skillId, wikiPage] of requestedSkills) {
        try {
            const wikitext = await loadWikitext(fileKey, wikiPage, sourceDir);
            const tabs = [
                ...chunkTabs("Free-to-play", collectRows(wikitext, "freeplay", itemIds)),
                ...chunkTabs("Members", collectRows(wikitext, "members", itemIds)),
            ];
            if (tabs.length === 0) throw new Error("no level-up entries parsed");
            const target = path.join(DATA_DIR, `${fileKey}.ts`);
            if (!dryRun) fs.writeFileSync(target, generateFile(skillId, tabs), "utf8");
            generated++;
            entries += tabs.reduce((total, tab) => total + tab.entries.length, 0);
            console.log(`[skill-guide] ${dryRun ? "Would generate" : "Generated"} ${fileKey}: ${tabs.length} tab(s).`);
        } catch (error) {
            console.warn(`[skill-guide] Skipped ${fileKey}; existing data was left untouched:`, error);
        }
    }
    console.log(`[skill-guide] ${dryRun ? "Would generate" : "Generated"} ${generated} guide(s), ${entries} entries.`);
}

main().catch((error) => {
    console.error("[skill-guide] Failed:", error);
    process.exitCode = 1;
});
