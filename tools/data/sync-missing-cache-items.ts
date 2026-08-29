/**
 * Appends only cache item definitions that do not already exist in
 * data/generated/server/items.json.
 *
 * The server snapshot deliberately remains authoritative for records already
 * curated there: this tool never rewrites, reorders, or replaces them. A
 * cache contains identity/equip information but no combat-bonus table, so run
 * `import-equipment-reference` immediately afterwards to fill bonuses for the
 * newly appended entries.
 *
 * Usage:
 *   pnpm --filter @august/server sync-missing-cache-items -- [cacheName] [--dry-run]
 */
import fs from "fs";
import path from "path";

import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { ObjStackability } from "@august/osrs-engine/config/objtype/ObjStackability";
import type { ObjType } from "@august/osrs-engine/config/objtype/ObjType";
import {
    EquipmentSlot,
    deriveAdditionalEquipSlotsFromParams,
    deriveEquipSlotFromParams,
} from "@august/osrs-engine/config/player/Equipment";
import { loadCache, loadCacheInfos } from "@tools/cache/client/load-util";
import { serverAppPath, serverGeneratedDataPath } from "@tools/lib/repository-paths";

const ITEMS_PATH = serverGeneratedDataPath("items.json");
const TARGET_PATH = serverAppPath("target.txt");
const DEFAULT_BLOCK_ANIMATION = 424;
const DEFAULT_STAND_ANIMATION = 808;
const DEFAULT_WALK_ANIMATION = 819;
const DEFAULT_RUN_ANIMATION = 824;
const DEFAULT_STAND_TURN_ANIMATION = 823;
const DEFAULT_TURN_180_ANIMATION = 820;
const DEFAULT_TURN_90_ANIMATION = 821;

type ExistingItemRecord = { id: number };

type ServerItemRecord = {
    id: number;
    name: string;
    examine: string;
    equipmentType: string;
    doubleHanded: boolean;
    stackable: boolean;
    tradeable: boolean;
    dropable: boolean;
    sellable: boolean;
    noted: boolean;
    value: number;
    highAlch: number;
    lowAlch: number;
    dropValue: number;
    noteId: number;
    blockAnim: number;
    standAnim: number;
    walkAnim: number;
    runAnim: number;
    standTurnAnim: number;
    turn180Anim: number;
    turn90CWAnim: number;
    turn90CCWAnim: number;
    weight: number;
};

function normalizeCacheName(value: string): string {
    return value
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.\/?/, "")
        .replace(/^caches\//, "")
        .replace(/\/$/, "");
}

function readTargetCacheName(): string {
    if (!fs.existsSync(TARGET_PATH)) {
        throw new Error(`Target cache file was not found: ${TARGET_PATH}`);
    }
    const target = normalizeCacheName(fs.readFileSync(TARGET_PATH, "utf8"));
    if (!target) throw new Error(`Target cache file is empty: ${TARGET_PATH}`);
    return target;
}

function resolveCacheInfo(cacheArg: string | undefined): CacheInfo {
    const caches = loadCacheInfos();
    // Never let an old caches.json "latest" entry decide an equipment
    // export.  target.txt names the cache the server actually boots, and is
    // refreshed into caches.json by ensure-cache before the normal sync.
    const requested = normalizeCacheName(cacheArg ?? "") || readTargetCacheName();

    const found = caches.find((cache) => cache.name === requested);
    if (!found) {
        throw new Error(
            `Target cache '${requested}' is not listed in apps/server/var/cache/osrs/caches.json. ` +
                "Run pnpm --filter @august/server ensure-cache first so the manifest and target cache agree.",
        );
    }
    return found;
}

function slotName(slot: EquipmentSlot | undefined): string {
    switch (slot) {
        case EquipmentSlot.HEAD:
            return "HEAD";
        case EquipmentSlot.CAPE:
            return "CAPE";
        case EquipmentSlot.AMULET:
            return "AMULET";
        case EquipmentSlot.WEAPON:
            return "WEAPON";
        case EquipmentSlot.BODY:
            return "BODY";
        case EquipmentSlot.SHIELD:
            return "SHIELD";
        case EquipmentSlot.LEGS:
            return "LEGS";
        case EquipmentSlot.GLOVES:
            return "GLOVES";
        case EquipmentSlot.BOOTS:
            return "BOOTS";
        case EquipmentSlot.RING:
            return "RING";
        case EquipmentSlot.AMMO:
            return "AMMO";
        case EquipmentSlot.HEAD2:
            return "HEAD2";
        default:
            return "NONE";
    }
}

function isNote(obj: ObjType): boolean {
    return (obj.noteTemplate | 0) !== -1;
}

function hasInventoryAction(obj: ObjType, action: string): boolean {
    const expected = action.toLowerCase();
    return (obj.inventoryActions ?? []).some(
        (entry) => typeof entry === "string" && entry.toLowerCase() === expected,
    );
}

function finiteNonNegative(value: number | undefined): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function readableName(value: string | undefined): string {
    const name = value?.trim();
    return !name || name.toLowerCase() === "null" ? "Null" : name;
}

/** Cache item weights are stored in tenths of kilograms; the server snapshot
 * expresses the ordinary game-facing value as kilograms. */
function readableWeight(value: number | undefined): number {
    return typeof value === "number" && Number.isFinite(value) ? value / 10 : 0;
}

function toServerItemRecord(
    id: number,
    obj: ObjType,
    noteIdsByUnnotedId: ReadonlyMap<number, number>,
): ServerItemRecord {
    const equipmentSlot = deriveEquipSlotFromParams(obj);
    const additionalSlots = deriveAdditionalEquipSlotsFromParams(obj);
    const noted = isNote(obj);
    const name = readableName(obj.name);
    const usableItem = name !== "Null";
    const cacheValue = finiteNonNegative(obj.price);

    return {
        id,
        name,
        examine: obj.examine?.trim() || "Unknown",
        equipmentType: slotName(equipmentSlot),
        doubleHanded:
            equipmentSlot === EquipmentSlot.WEAPON && additionalSlots.includes(EquipmentSlot.SHIELD),
        stackable: obj.stackability === ObjStackability.ALWAYS,
        tradeable: obj.isTradable === true,
        dropable: usableItem && (hasInventoryAction(obj, "drop") || hasInventoryAction(obj, "discard")),
        // There is no cache sell-price/stock source. This matches the
        // conservative server behaviour for normal tradeable item records;
        // shop-specific rules still validate their own stock/prices.
        sellable: obj.isTradable === true,
        noted,
        value: cacheValue,
        // Cache ObjTypes do not store alchemy or death-protection values.
        // The reference importer intentionally owns combat stats; these
        // economic fields remain safe zeroes until an economics source is
        // introduced instead of guessing from the GE/cache price.
        highAlch: 0,
        lowAlch: 0,
        dropValue: 0,
        noteId: noted ? (obj.note | 0) : (noteIdsByUnnotedId.get(id) ?? -1),
        blockAnim: DEFAULT_BLOCK_ANIMATION,
        standAnim: DEFAULT_STAND_ANIMATION,
        walkAnim: DEFAULT_WALK_ANIMATION,
        runAnim: DEFAULT_RUN_ANIMATION,
        standTurnAnim: DEFAULT_STAND_TURN_ANIMATION,
        turn180Anim: DEFAULT_TURN_180_ANIMATION,
        turn90CWAnim: DEFAULT_TURN_90_ANIMATION,
        turn90CCWAnim: DEFAULT_TURN_90_ANIMATION,
        weight: readableWeight(obj.weight),
    };
}

function readExistingItemIds(text: string): Set<number> {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Generated items snapshot must contain an array");

    const ids = new Set<number>();
    for (const entry of parsed) {
        const id = (entry as Partial<ExistingItemRecord>)?.id;
        if (typeof id !== "number" || !Number.isInteger(id) || id < 0) {
            throw new Error("Generated items snapshot contains an item without a non-negative integer id");
        }
        if (ids.has(id)) throw new Error(`Generated items snapshot contains duplicate item id ${id}`);
        ids.add(id);
    }
    return ids;
}

/** Append pretty JSON objects without serializing any existing record. */
function appendRecords(text: string, records: readonly ServerItemRecord[]): string {
    if (records.length === 0) return text;
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    const closeIndex = text.lastIndexOf("]");
    if (closeIndex < 0 || text.slice(closeIndex + 1).trim().length !== 0) {
        throw new Error("Generated items snapshot is not a simple top-level JSON array");
    }

    const beforeClose = text.slice(0, closeIndex).replace(/[\t \r\n]+$/, "");
    const hasExistingRecords = beforeClose.trim() !== "[";
    const appended = records.map((record) => JSON.stringify(record, null, 2)).join(`,${lineEnding}`);
    return `${beforeClose}${hasExistingRecords ? "," : ""}${lineEnding}${appended}${lineEnding}]${lineEnding}`;
}

function parseArguments(args: readonly string[]): { cacheName?: string; dryRun: boolean } {
    const dryRun = args.includes("--dry-run");
    const cacheName = args.find((arg) => arg !== "--dry-run");
    if (args.some((arg) => arg !== "--dry-run" && arg.startsWith("--"))) {
        throw new Error("Usage: sync-missing-cache-items [cacheName] [--dry-run]");
    }
    return { cacheName, dryRun };
}

function main(): void {
    const { cacheName, dryRun } = parseArguments(process.argv.slice(2));
    const cacheInfo = resolveCacheInfo(cacheName);
    const existingText = fs.readFileSync(ITEMS_PATH, "utf8");
    const existingIds = readExistingItemIds(existingText);

    const loaded = loadCache(cacheInfo);
    const cacheSystem = CacheSystem.fromFiles(loaded.type, loaded.files);
    const objTypeLoader = getCacheLoaderFactory(cacheInfo, cacheSystem).getObjTypeLoader();
    const cacheObjects = new Map<number, ObjType>();
    const noteIdsByUnnotedId = new Map<number, number>();

    for (let id = 0; id < objTypeLoader.getCount(); id++) {
        try {
            const obj = objTypeLoader.load(id);
            cacheObjects.set(id, obj);
            if (isNote(obj) && (obj.note | 0) >= 0) {
                noteIdsByUnnotedId.set(obj.note | 0, id);
            }
        } catch {
            // A corrupt/unreadable archive entry cannot be made useful by
            // adding an invented record. It is reported in the final count.
        }
    }

    const missing: ServerItemRecord[] = [];
    for (const [id, obj] of cacheObjects) {
        if (!existingIds.has(id)) {
            missing.push(toServerItemRecord(id, obj, noteIdsByUnnotedId));
        }
    }
    missing.sort((left, right) => left.id - right.id);

    const unreadable = objTypeLoader.getCount() - cacheObjects.size;
    console.log(
        `[sync-missing-cache-items] cache=${cacheInfo.name} cacheItems=${cacheObjects.size} ` +
            `existing=${existingIds.size} missing=${missing.length} unreadable=${unreadable}`,
    );
    if (missing.length === 0) {
        console.log("[sync-missing-cache-items] items.json is already complete for this cache.");
        return;
    }
    console.log(
        `[sync-missing-cache-items] ${dryRun ? "Would append" : "Appending"} ids ` +
            `${missing[0].id} through ${missing[missing.length - 1].id}.`,
    );
    if (dryRun) return;

    fs.writeFileSync(ITEMS_PATH, appendRecords(existingText, missing), "utf8");
    console.log(`[sync-missing-cache-items] Added ${missing.length} records to ${ITEMS_PATH}.`);
    console.log(
        "[sync-missing-cache-items] Next run: pnpm --filter @august/server import-equipment-reference",
    );
}

main();
