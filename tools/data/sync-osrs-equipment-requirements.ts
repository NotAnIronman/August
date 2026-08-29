/**
 * Builds a skill-requirement reference for wearable cache items from the
 * OSRS Wiki's public Skill/Level up table pages.
 *
 * Item definitions in the game cache describe models and equip slots, but
 * not the skill gates enforced when an item is worn.  The Wiki's level-up
 * tables are the maintainable source for those gates: a row identifies the
 * required level for its skill and may list explicit additional skills.
 *
 * The generated reference is intentionally ignored like the combat-bonus
 * reference.  Run import-equipment-reference afterwards to make the server's
 * tracked items.json enforce the refreshed requirements at runtime.
 *
 * Usage:
 *   pnpm --filter @august/server sync-equipment-requirements
 *   pnpm --filter @august/server sync-equipment-requirements -- --source-dir data/references/skill-guide
 */
import fs from "fs";
import path from "path";
import { referencePath, serverGeneratedDataPath } from "@tools/lib/repository-paths";

const ITEMS_PATH = serverGeneratedDataPath("items.json");
const DESTINATION = referencePath("osrs-equipment-requirements.json");
const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const REQUIREMENT_COUNT = 23;

const SKILLS = [
    ["attack", "Attack", 0],
    ["defence", "Defence", 1],
    ["strength", "Strength", 2],
    ["hitpoints", "Hitpoints", 3],
    ["ranged", "Ranged", 4],
    ["prayer", "Prayer", 5],
    ["magic", "Magic", 6],
    ["cooking", "Cooking", 7],
    ["woodcutting", "Woodcutting", 8],
    ["fletching", "Fletching", 9],
    ["fishing", "Fishing", 10],
    ["firemaking", "Firemaking", 11],
    ["crafting", "Crafting", 12],
    ["smithing", "Smithing", 13],
    ["mining", "Mining", 14],
    ["herblore", "Herblore", 15],
    ["agility", "Agility", 16],
    ["thieving", "Thieving", 17],
    ["slayer", "Slayer", 18],
    ["farming", "Farming", 19],
    ["runecraft", "Runecraft", 20],
    ["hunter", "Hunter", 21],
    ["construction", "Construction", 22],
] as const;

type LocalItem = {
    id: number;
    name?: string;
    noted?: boolean;
    equipmentType?: string;
};
type ParsedWikiResponse = { parse?: { wikitext?: { "*"?: string } } };
type RequirementRecord = { id: number; requirements: number[] };
type ItemNameIndex = {
    exactIds: Map<string, number>;
    equipable: LocalItem[];
};

function normalizeName(value: string): string {
    return value
        .toLowerCase()
        .replace(/<!--.*?-->/g, "")
        .replace(/\s+/g, " ")
        .replace(/[’]/g, "'")
        .trim();
}

function parseArguments(args: readonly string[]): { sourceDir?: string } {
    const sourceIndex = args.indexOf("--source-dir");
    const sourceDir = sourceIndex < 0 ? undefined : args[sourceIndex + 1]?.trim();
    if (sourceIndex >= 0 && !sourceDir) throw new Error("--source-dir requires a directory path");
    if (args.some((arg, index) => arg.startsWith("--") && arg !== "--source-dir" && index !== sourceIndex + 1)) {
        throw new Error("Usage: sync-equipment-requirements [--source-dir path]");
    }
    return { sourceDir: sourceDir ? path.resolve(sourceDir) : undefined };
}

function buildItemIdsByName(): ItemNameIndex {
    const items = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LocalItem[];
    if (!Array.isArray(items)) throw new Error("Generated items snapshot must contain an array");
    const candidates = new Map<string, LocalItem[]>();
    for (const item of items) {
        const name = item.name?.trim();
        if (!name || name.toLowerCase() === "null" || item.equipmentType === "NONE") continue;
        const key = normalizeName(name);
        const bucket = candidates.get(key) ?? [];
        bucket.push(item);
        candidates.set(key, bucket);
    }
    const exactIds = new Map<string, number>();
    for (const [name, candidatesForName] of candidates) {
        // Prefer a wearable, unnoted record. If more than one remains, leave
        // it unresolved rather than applying a requirement to an arbitrary
        // variant with the same display name.
        const unnoted = candidatesForName.filter((item) => item.noted !== true);
        const selected = unnoted.length === 1 ? unnoted : candidatesForName.length === 1 ? candidatesForName : [];
        if (selected.length === 1) exactIds.set(name, selected[0].id);
    }
    return {
        exactIds,
        equipable: items.filter(
            (item) =>
                item.name?.trim() &&
                item.name.toLowerCase() !== "null" &&
                item.equipmentType !== "NONE",
        ),
    };
}

function itemIdsForLine(raw: string, itemIndex: ItemNameIndex): number[] {
    const ids = new Set<number>();
    const wantsWearable = /\bwear\b/i.test(raw);
    const wantsWeapon = /\b(?:wield|equip)\b/i.test(raw) && !wantsWearable;
    for (const match of raw.matchAll(/\{\{plink\|([^{}]*?)\}\}/gi)) {
        const parts = match[1].split("|").map((part) => part.trim());
        const target = parts[0]?.split("#")[0] ?? "";
        const picture = parts.find((part) => part.toLowerCase().startsWith("pic="))?.slice(4) ?? "";
        // A picture is usually the exact variant when the link target names a
        // broad equipment family (for example a godsword or metal tier).
        for (const candidate of [picture, target]) {
            const id = itemIndex.exactIds.get(normalizeName(candidate));
            if (id !== undefined) ids.add(id);
        }

        // Wiki level-up rows often link a family such as "Torva armour" and
        // show one representative picture. Expand only clear equipment-family
        // names, and constrain the expansion to the row's wear/wield verb so
        // Rune armour cannot accidentally impose Defence on a Rune weapon.
        const family = normalizeName(target).replace(
            /\s+(?:armour|equipment|robes|weapons)$/,
            "",
        );
        if (family && family !== normalizeName(target)) {
            for (const item of itemIndex.equipable) {
                const name = normalizeName(item.name ?? "");
                if (!name.startsWith(`${family} `)) continue;
                if (wantsWearable && item.equipmentType === "WEAPON") continue;
                if (wantsWeapon && item.equipmentType !== "WEAPON") continue;
                ids.add(item.id);
            }
        }
    }
    return [...ids];
}

function addRequirement(requirements: Map<number, number[]>, itemId: number, skillIndex: number, level: number): void {
    if (!(itemId >= 0) || !(skillIndex >= 0) || !(level > 0)) return;
    const existing = requirements.get(itemId) ?? Array.from({ length: REQUIREMENT_COUNT }, () => 0);
    existing[skillIndex] = Math.max(existing[skillIndex], Math.trunc(level));
    requirements.set(itemId, existing);
}

function collectSkillRequirements(
    wikitext: string,
    skillIndex: number,
    itemIndex: ItemNameIndex,
    skillIndexByName: ReadonlyMap<string, number>,
    requirements: Map<number, number[]>,
): void {
    const sections = /^\|(freeplay|members)(\d+)\s*=\s*([\s\S]*?)(?=^\|(freeplay|members)(?:all|\d+)\s*=|^\}\})/gim;
    for (const match of wikitext.matchAll(sections)) {
        const level = Number(match[2]);
        if (!Number.isInteger(level) || level < 1 || level > 99) continue;
        for (const rawLine of match[3].split(/\r?\n/)) {
            if (!/^\*+\s+/.test(rawLine) || !/\b(?:wield|wear|equip)\b/i.test(rawLine)) continue;
            const itemIds = itemIdsForLine(rawLine, itemIndex);
            if (itemIds.length === 0) continue;
            for (const itemId of itemIds) addRequirement(requirements, itemId, skillIndex, level);

            // Additional requirements are marked in the source with SCP
            // templates. An omitted level means the row's level (such as the
            // shared level-42 Void equipment requirement).
            for (const skillMatch of rawLine.matchAll(/\{\{SCP\|([^|}]+)(?:\|([^}]+))?\}\}/gi)) {
                const secondarySkill = skillIndexByName.get(normalizeName(skillMatch[1]));
                const explicitLevel = Number(skillMatch[2]);
                const secondaryLevel = Number.isInteger(explicitLevel) && explicitLevel > 0 ? explicitLevel : level;
                if (secondarySkill === undefined) continue;
                for (const itemId of itemIds) {
                    addRequirement(requirements, itemId, secondarySkill, secondaryLevel);
                }
            }
        }
    }
}

async function loadWikitext(fileKey: string, wikiPage: string, sourceDir: string | undefined): Promise<string> {
    if (sourceDir) return fs.readFileSync(path.join(sourceDir, `${fileKey}.wikitext`), "utf8");
    const url = new URL(WIKI_API);
    url.searchParams.set("action", "parse");
    url.searchParams.set("page", `${wikiPage}/Level up table`);
    url.searchParams.set("prop", "wikitext");
    url.searchParams.set("format", "json");
    const response = await fetch(url, { headers: { "user-agent": "xrsps-equipment-requirements/1.0" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = (await response.json()) as ParsedWikiResponse;
    const text = parsed.parse?.wikitext?.["*"];
    if (!text) throw new Error("page did not include wikitext");
    return text;
}

async function main(): Promise<void> {
    const { sourceDir } = parseArguments(process.argv.slice(2));
    const itemIndex = buildItemIdsByName();
    const skillIndexByName = new Map(SKILLS.map(([, wikiPage, index]) => [normalizeName(wikiPage), index]));
    const requirements = new Map<number, number[]>();
    const failures: string[] = [];

    for (const [fileKey, wikiPage, skillIndex] of SKILLS) {
        try {
            collectSkillRequirements(
                await loadWikitext(fileKey, wikiPage, sourceDir),
                skillIndex,
                itemIndex,
                skillIndexByName,
                requirements,
            );
        } catch (error) {
            failures.push(`${wikiPage}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    if (failures.length > 0) {
        throw new Error(
            `Refusing to write an incomplete requirements reference; ${failures.join("; ")}`,
        );
    }

    const records: RequirementRecord[] = [...requirements]
        .filter(([, values]) => values.some((value) => value > 0))
        .map(([id, values]) => ({ id, requirements: values }))
        .sort((left, right) => left.id - right.id);
    fs.mkdirSync(path.dirname(DESTINATION), { recursive: true });
    fs.writeFileSync(
        DESTINATION,
        `${JSON.stringify(
            {
                format: "xrsps.osrs-equipment-requirements.v1",
                generatedAt: new Date().toISOString(),
                source: "https://oldschool.runescape.wiki/w/Skill/Level_up_table",
                records,
            },
            null,
            2,
        )}\n`,
        "utf8",
    );
    console.log(
        `[equipment-requirements] Saved ${records.length} cache-backed requirement records to ${DESTINATION}.`,
    );
}

void main().catch((error) => {
    console.error(`[equipment-requirements] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
