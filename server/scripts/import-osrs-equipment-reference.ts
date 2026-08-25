/**
 * Refreshes equipment bonuses in `server/data/items.json` from the published
 * OSRS equipment reference snapshot.
 *
 * The game cache supplies an item's identity, models and equip slots, but it
 * does not encode combat bonuses. This importer deliberately updates only
 * IDs that are present in the local cache export; it never creates cache-less
 * item definitions that the client would be unable to render or equip.
 *
 * It preserves the existing JSON's spelling and formatting. Large cache data
 * files are intentionally hand-friendly, so a refresh must not turn 0.0 into
 * 0 or rewrite escaped display names that did not actually change.
 *
 * Usage:
 *   yarn --cwd server import-equipment-reference
 *   yarn --cwd server import-equipment-reference --dry-run
 *   yarn --cwd server import-equipment-reference --source path/to/equipment.json
 */
import fs from "fs";
import path from "path";

const REFERENCE_URL =
    "https://raw.githubusercontent.com/MisterTriangle/osrs-item-reference-data/main/osrs-equipment.json";
const ITEMS_PATH = path.resolve(path.dirname(process.argv[1] ?? "."), "../data/items.json");
const BONUS_FIELDS = [
    "attack_stab",
    "attack_slash",
    "attack_crush",
    "attack_magic",
    "attack_ranged",
    "defence_stab",
    "defence_slash",
    "defence_crush",
    "defence_magic",
    "defence_ranged",
    "melee_strength",
    "ranged_strength",
    "magic_damage_percent",
    "prayer_bonus",
] as const;

type LocalItem = { id: number; bonuses?: number[]; doubleHanded?: boolean };
type ReferenceRecord = {
    exact_osrs_item_id: number;
    is_two_handed?: boolean;
    [field: string]: unknown;
};
type ReferenceFile = { records?: ReferenceRecord[] } | ReferenceRecord[];
type ImportResult = {
    text: string;
    matchedCacheItems: number;
    updatedBonuses: number;
    updatedTwoHanded: number;
    unavailableInCache: number;
};

function readSourceArgument(args: readonly string[]): string | undefined {
    const index = args.indexOf("--source");
    if (index < 0) return undefined;
    const value = args[index + 1]?.trim();
    if (!value) throw new Error("--source requires a JSON file path");
    return path.resolve(value);
}

function numberAt(record: ReferenceRecord, field: (typeof BONUS_FIELDS)[number]): number {
    const raw = record[field];
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value)) {
        throw new Error(`Reference item ${record.exact_osrs_item_id} has no valid ${field} bonus`);
    }
    return Math.trunc(value);
}

function bonusesFor(record: ReferenceRecord): number[] {
    return BONUS_FIELDS.map((field) => numberAt(record, field));
}

function sameBonuses(left: readonly number[] | undefined, right: readonly number[]): boolean {
    return (
        Array.isArray(left) &&
        left.length === right.length &&
        left.every((value, index) => Number(value) === right[index])
    );
}

function formatBonuses(values: readonly number[], newline: string): string {
    const lines = values
        .map((value, index) => `      ${value}${index === values.length - 1 ? "" : ","}`)
        .join(newline);
    return `    "bonuses": [${newline}${lines}${newline}    ]`;
}

function appendProperty(chunk: string, property: string, newline: string): string {
    const closeIndex = chunk.lastIndexOf(`${newline}  }`);
    if (closeIndex < 0) throw new Error("Unable to locate item JSON closing brace");
    return `${chunk.slice(0, closeIndex)},${newline}${property}${chunk.slice(closeIndex)}`;
}

function addBonusesProperty(chunk: string, property: string, newline: string): string {
    // `doubleHanded` is usually the final existing property. Insert bonuses
    // immediately before it so adding missing stats does not move that field
    // (and needlessly obscure the real data change in review).
    const doubleHandedIndex = chunk.lastIndexOf(`${newline}    "doubleHanded":`);
    if (doubleHandedIndex >= 0) {
        return `${chunk.slice(0, doubleHandedIndex)}${newline}${property},${chunk.slice(
            doubleHandedIndex,
        )}`;
    }
    return appendProperty(chunk, property, newline);
}

function updateItemsJson(text: string, reference: readonly ReferenceRecord[]): ImportResult {
    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    const referenceById = new Map<number, ReferenceRecord>();
    for (const record of reference) {
        const id = Number(record.exact_osrs_item_id);
        if (Number.isInteger(id) && id >= 0) referenceById.set(id, record);
    }

    let matchedCacheItems = 0;
    let updatedBonuses = 0;
    let updatedTwoHanded = 0;
    const matchedIds = new Set<number>();
    const itemObjectPattern = /^  \{\r?\n.*?^  \}(?=,?\r?\n)/gms;
    const updatedText = text.replace(itemObjectPattern, (chunk) => {
        const local = JSON.parse(chunk) as LocalItem;
        const id = Number(local.id);
        const record = referenceById.get(id);
        if (!record) return chunk;

        matchedCacheItems++;
        matchedIds.add(id);
        const bonuses = bonusesFor(record);
        let updatedChunk = chunk;
        if (!sameBonuses(local.bonuses, bonuses)) {
            const replacement = formatBonuses(bonuses, newline);
            const existing = /^    "bonuses": \[\r?\n.*?^    \](,?)/ms;
            const existingMatch = updatedChunk.match(existing);
            if (existingMatch) {
                // Keep an unchanged cache spelling such as `0.0` intact.
                // This makes the generated review diff show only actual stat
                // corrections, not superficial numeric formatting changes.
                let bonusIndex = 0;
                const corrected = existingMatch[0].replace(/-?\d+(?:\.\d+)?/g, (token) => {
                    const expected = bonuses[bonusIndex++];
                    return Number(token) === expected ? token : String(expected);
                });
                updatedChunk = updatedChunk.replace(existing, corrected);
            } else {
                updatedChunk = addBonusesProperty(updatedChunk, replacement, newline);
            }
            updatedBonuses++;
        }

        const twoHanded = record.is_two_handed === true;
        if ((local.doubleHanded === true) !== twoHanded) {
            const existing = /^(    "doubleHanded": )(?:true|false)(,?)$/m;
            if (existing.test(updatedChunk)) {
                updatedChunk = updatedChunk.replace(
                    existing,
                    (_match, prefix: string, comma: string) => `${prefix}${twoHanded}${comma}`,
                );
            } else if (twoHanded) {
                updatedChunk = appendProperty(updatedChunk, '    "doubleHanded": true', newline);
            }
            updatedTwoHanded++;
        }
        return updatedChunk;
    });

    return {
        text: updatedText,
        matchedCacheItems,
        updatedBonuses,
        updatedTwoHanded,
        unavailableInCache: referenceById.size - matchedIds.size,
    };
}

async function readReference(sourcePath: string | undefined): Promise<ReferenceRecord[]> {
    if (sourcePath && !fs.existsSync(sourcePath)) {
        throw new Error(
            `Equipment reference file was not found: ${sourcePath}. ` +
                "Omit --source to download the maintained reference automatically.",
        );
    }
    const text = sourcePath
        ? fs.readFileSync(sourcePath, "utf8")
        : await (async () => {
              const response = await fetch(REFERENCE_URL);
              if (!response.ok) {
                  throw new Error(`Equipment reference download failed: HTTP ${response.status}`);
              }
              return response.text();
          })();
    const parsed = JSON.parse(text) as ReferenceFile;
    const records = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(records)) {
        throw new Error("Equipment reference must be an array or an object with a records array");
    }
    return records;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const sourcePath = readSourceArgument(args);
    const localItemsText = fs.readFileSync(ITEMS_PATH, "utf8");
    const localItems = JSON.parse(localItemsText) as LocalItem[];
    if (!Array.isArray(localItems)) throw new Error("server/data/items.json must be an array");

    const result = updateItemsJson(localItemsText, await readReference(sourcePath));
    if (!dryRun && result.text !== localItemsText) {
        fs.writeFileSync(ITEMS_PATH, result.text, "utf8");
    }

    console.log(
        `[equipment-import] ${dryRun ? "Dry run: " : ""}matched ${result.matchedCacheItems} cache items; ` +
            `${result.updatedBonuses} bonus records and ${result.updatedTwoHanded} two-handed flags ${
                dryRun ? "would be" : "were"
            } updated; ${result.unavailableInCache} current-reference IDs are not in this cache revision.`,
    );
}

main().catch((error) => {
    console.error("[equipment-import] Failed:", error);
    process.exitCode = 1;
});
