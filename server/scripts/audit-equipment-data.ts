/**
 * Reports cache items which can be equipped but still lack an authoritative
 * 14-value combat-bonus record. It does not modify any data.
 *
 * This is deliberately paired with sync-missing-cache-items and
 * import-equipment-reference: an item must exist in the active cache before
 * it can be safely added to items.json, then this audit proves whether its
 * bonuses were actually filled.
 *
 * Usage:
 *   yarn --cwd server audit-equipment-data
 *   yarn --cwd server audit-equipment-data --source path/to/osrs-equipment.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ITEMS_PATH = path.resolve(SCRIPT_DIR, "../data/items.json");
const WEAPONS_PATH = path.resolve(SCRIPT_DIR, "../gamemodes/vanilla/data/weapons.ts");
const REFERENCE_URL =
    "https://raw.githubusercontent.com/MisterTriangle/osrs-item-reference-data/main/osrs-equipment.json";

const EQUIPPABLE_TYPES = new Set([
    "AMULET",
    "ARROWS",
    "BODY",
    "BOOTS",
    "CAPE",
    "COIF",
    "FULL_HELMET",
    "GLOVES",
    "HAT",
    "HOODED_CAPE",
    "LEGS",
    "MASK",
    "MED_HELMET",
    "PLATEBODY",
    "RING",
    "SHIELD",
    "WEAPON",
]);

type LocalItem = {
    id: number;
    name?: string;
    equipmentType?: string;
    bonuses?: unknown;
};
type ReferenceRecord = { exact_osrs_item_id?: number };
type ReferenceFile = { records?: ReferenceRecord[] } | ReferenceRecord[];

function readSourceArgument(args: readonly string[]): string | undefined {
    const index = args.indexOf("--source");
    if (index < 0) return undefined;
    const value = args[index + 1]?.trim();
    if (!value) throw new Error("--source requires a JSON file path");
    return path.resolve(value);
}

function hasCompleteBonuses(item: LocalItem): boolean {
    return (
        Array.isArray(item.bonuses) &&
        item.bonuses.length === 14 &&
        item.bonuses.every((value) => typeof value === "number" && Number.isFinite(value))
    );
}

async function readReferenceIds(sourcePath: string | undefined): Promise<Set<number>> {
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
    if (!Array.isArray(records)) throw new Error("Equipment reference must contain a records array");
    return new Set(
        records
            .map((record) => Number(record.exact_osrs_item_id))
            .filter((id) => Number.isInteger(id) && id >= 0),
    );
}

function weaponConfigIds(): number[] {
    const source = fs.readFileSync(WEAPONS_PATH, "utf8");
    const ids = new Set<number>();
    for (const match of source.matchAll(/\bitemId:\s*(\d+)/g)) {
        const id = Number(match[1]);
        if (Number.isInteger(id) && id > 0) ids.add(id);
    }
    return [...ids].sort((left, right) => left - right);
}

async function main(): Promise<void> {
    const sourcePath = readSourceArgument(process.argv.slice(2));
    const items = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as LocalItem[];
    if (!Array.isArray(items)) throw new Error("server/data/items.json must be an array");

    const knownIds = new Set(items.map((item) => item.id));
    const referenceIds = await readReferenceIds(sourcePath);
    const equipable = items.filter(
        (item) =>
            EQUIPPABLE_TYPES.has(item.equipmentType ?? "") &&
            item.name?.trim().toLowerCase() !== "null",
    );
    const missingBonuses = equipable.filter((item) => !hasCompleteBonuses(item));
    const sourceBackedGaps = missingBonuses.filter((item) => referenceIds.has(item.id));
    const configuredWeaponGaps = weaponConfigIds().filter((id) => !knownIds.has(id));

    console.log(
        `[equipment-audit] cache items=${items.length}; equipable=${equipable.length}; ` +
            `missing 14-value bonuses=${missingBonuses.length}; ` +
            `reference-backed gaps=${sourceBackedGaps.length}.`,
    );
    if (sourceBackedGaps.length > 0) {
        console.log("[equipment-audit] Items ready for import (first 100):");
        for (const item of sourceBackedGaps.slice(0, 100)) {
            console.log(`  ${item.id}: ${item.name ?? "Unnamed item"} (${item.equipmentType})`);
        }
    }
    if (configuredWeaponGaps.length > 0) {
        console.log(
            `[equipment-audit] Weapon configurations absent from items.json: ${configuredWeaponGaps.join(", ")}.`,
        );
        console.log(
            "[equipment-audit] Run sync-missing-cache-items against the active cache, then import-equipment-reference.",
        );
    }
}

main().catch((error) => {
    console.error("[equipment-audit] Failed:", error);
    process.exitCode = 1;
});
