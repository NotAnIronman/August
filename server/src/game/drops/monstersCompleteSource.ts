import fs from "fs";
import path from "path";

import { getItemDefinition } from "../../data/items";
import type { ImportedMonsterDefinition, NpcDropEntryDefinition } from "./types";

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

function resolveMonstersCompletePath(): string {
    // `yarn --cwd server` runs the world with server/ as its cwd, whereas
    // content tooling conventionally stores this ignored source file at the
    // repository-root references/ directory. Support both without making the
    // game depend on how it was launched.
    const candidates = [
        path.resolve("references/monsters-complete.json"),
        path.resolve(__dirname, "../../../../references/monsters-complete.json"),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

let cachedEntries: ImportedMonsterDefinition[] | undefined;

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
        rarity: (drop.rarity ?? 0) * Math.max(1, drop.rolls ?? 1),
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
        table: {
            always,
            pools: pools.length > 0 ? pools : undefined,
        },
    };
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

export function loadMonstersCompleteDefinitions(): ImportedMonsterDefinition[] {
    if (cachedEntries) return cachedEntries;
    try {
        const rawText = fs.readFileSync(resolveMonstersCompletePath(), "utf8");
        cachedEntries = parseTopLevelEntries(rawText)
            .map((entry) => normalizeRawMonster(entry))
            .filter((entry): entry is ImportedMonsterDefinition => entry !== undefined);
    } catch {
        cachedEntries = [];
    }
    return cachedEntries;
}
