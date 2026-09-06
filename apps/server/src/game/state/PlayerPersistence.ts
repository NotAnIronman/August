import fs from "fs";
import { sanitizeRaidCheckpoint } from "@server/game/state/PlayerRaidState";
import { sanitizeMoonProgress } from "@server/game/state/PlayerMoonState";
import { sanitizePendingLoot } from "@server/game/state/PlayerLootState";
import { sanitizeFirstPetDrops } from "@server/game/state/PlayerFollowerPersistState";
import type { StatementSync } from "node:sqlite";
import path from "path";
import { sanitizeTheatreRun, type TheatreRunStore } from "@server/content/modules/theatre-of-blood/TheatreRun";

import { EquipmentSlot } from "@august/osrs-engine/config/player/Equipment";
import { PRAYER_NAME_SET, type PrayerName } from "@august/osrs-engine/prayer/prayers";
import { SKILL_IDS } from "@august/osrs-engine/skill/skills";
import { DEFAULT_EQUIP_SLOT_COUNT } from "@server/game/equipment";
import {
    type BankSnapshotEntry,
    type EquipmentSnapshotEntry,
    INVENTORY_SLOT_COUNT,
    type InventorySnapshotEntry,
    type PlayerLocationSnapshot,
    type PlayerPersistentVars,
    type PlayerSkillPersistentEntry,
    PlayerState,
    normalizeSkillXpValue,
} from "@server/game/player";
import type { PersistenceProvider } from "@server/game/state/PersistenceProvider";
import { DEFAULT_BANK_CAPACITY } from "@server/game/state/PlayerBankSystem";
import {
    MAX_PLAYER_STATE_JSON_BYTES,
    getSqliteDatabase,
    type SqliteDatabase,
} from "@server/game/state/SqliteDatabase";
import { serverVarPath } from "@server/paths";

const DEFAULT_DATA_DIR = serverVarPath("gamemodes", "default");
const MAX_TILE_COORD = 32767;
const MAX_LOCATION_LEVEL = 3;
const MAX_ROTATION = 2047;
const MAX_RUN_ENERGY = 10000;
const MAX_SPECIAL_ENERGY = 100;
const MAX_STACK_QUANTITY = 2_147_483_647;
const MIN_SIGNED_INTEGER = -2_147_483_648;
const MAX_BANK_TAB = 9;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteInteger(value: unknown): number | undefined {
    return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function clampedInteger(value: unknown, minimum: number, maximum: number): number | undefined {
    const normalized = finiteInteger(value);
    if (normalized === undefined) return undefined;
    return Math.max(minimum, Math.min(maximum, normalized));
}

function rangedInteger(value: unknown, minimum: number, maximum: number): number | undefined {
    const normalized = finiteInteger(value);
    return normalized !== undefined && normalized >= minimum && normalized <= maximum
        ? normalized
        : undefined;
}

function positiveId(value: unknown): number | undefined {
    const normalized = finiteInteger(value);
    return normalized !== undefined && normalized > 0 && normalized <= MAX_STACK_QUANTITY
        ? normalized
        : undefined;
}

function stackQuantity(value: unknown, allowZero = false): number | undefined {
    const normalized = finiteInteger(value);
    const minimum = allowZero ? 0 : 1;
    if (normalized === undefined || normalized < minimum) return undefined;
    return Math.min(MAX_STACK_QUANTITY, normalized);
}

interface SanitizedCollectionLogCategoryStat {
    structId: number;
    count1: number;
    count2?: number;
    count3?: number;
}

interface SanitizedCollectionLogUnlockEntry {
    itemId: number;
    runeDay: number;
    sequence: number;
}

function readJsonFile<T>(filePath: string, fallback: T): T {
    try {
        if (!fs.existsSync(filePath)) {
            return fallback;
        }
        const raw = fs.readFileSync(filePath, "utf8");
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function sanitizeInventorySnapshot(
    entries: InventorySnapshotEntry[] | undefined,
): InventorySnapshotEntry[] | undefined {
    if (entries === undefined) return undefined;
    if (!Array.isArray(entries)) return [];
    const bySlot = new Map<number, InventorySnapshotEntry>();
    for (const entry of entries) {
        if (!isRecord(entry)) continue;
        const slot = rangedInteger(entry.slot, 0, INVENTORY_SLOT_COUNT - 1);
        const itemId = positiveId(entry.itemId);
        const quantity = stackQuantity(entry.quantity);
        if (slot === undefined) continue;
        if (itemId === undefined || quantity === undefined) continue;
        // PlayerInventoryState applies entries in order, so retaining the last
        // valid value preserves the old duplicate-slot behavior deterministically.
        bySlot.set(slot, { slot, itemId, quantity });
    }
    const sanitized = Array.from(bySlot.values());
    sanitized.sort((a, b) => a.slot - b.slot);
    return entries.length === 0 ? [] : sanitized;
}

function sanitizeEquipmentSnapshot(
    entries: EquipmentSnapshotEntry[] | undefined,
): EquipmentSnapshotEntry[] | undefined {
    if (entries === undefined) return undefined;
    if (!Array.isArray(entries)) return [];
    const bySlot = new Map<number, EquipmentSnapshotEntry>();
    for (const entry of entries) {
        if (!isRecord(entry)) continue;
        const slot = rangedInteger(entry.slot, 0, DEFAULT_EQUIP_SLOT_COUNT - 1);
        const itemId = positiveId(entry.itemId);
        if (slot === undefined) continue;
        if (itemId === undefined) continue;
        if (slot === EquipmentSlot.AMMO) {
            const quantity = entry.quantity === undefined ? 1 : stackQuantity(entry.quantity);
            if (quantity === undefined) continue;
            bySlot.set(slot, { slot, itemId, quantity });
        } else {
            bySlot.set(slot, { slot, itemId });
        }
    }
    const sanitized = Array.from(bySlot.values());
    sanitized.sort((a, b) => a.slot - b.slot);
    return entries.length === 0 ? [] : sanitized;
}

function sanitizeSkillsSnapshot(
    entries: PlayerSkillPersistentEntry[] | undefined,
): PlayerSkillPersistentEntry[] | undefined {
    if (entries === undefined) return undefined;
    if (!Array.isArray(entries)) return [];
    const validIds = new Set<number>(SKILL_IDS);
    const byId = new Map<number, PlayerSkillPersistentEntry>();
    for (const entry of entries) {
        if (!isRecord(entry)) continue;
        const normalizedId = finiteInteger(entry.id);
        if (normalizedId === undefined) continue;
        if (!validIds.has(normalizedId)) continue;
        if (typeof entry.xp !== "number" || !Number.isFinite(entry.xp)) continue;
        const out: PlayerSkillPersistentEntry = {
            id: normalizedId,
            xp: normalizeSkillXpValue(entry.xp),
        };
        if (entry.boost !== undefined) {
            const boost = finiteInteger(entry.boost);
            if (boost !== undefined) out.boost = boost;
        }
        byId.set(normalizedId, out);
    }
    const sanitized = Array.from(byId.values()).sort((a, b) => a.id - b.id);
    return entries.length === 0 ? [] : sanitized;
}

function sanitizeLocationSnapshot(
    snapshot: PlayerLocationSnapshot | undefined,
): PlayerLocationSnapshot | undefined {
    if (!isRecord(snapshot)) return undefined;
    const x = clampedInteger(snapshot.x, 0, MAX_TILE_COORD);
    const y = clampedInteger(snapshot.y, 0, MAX_TILE_COORD);
    const level = clampedInteger(snapshot.level, 0, MAX_LOCATION_LEVEL);
    if (x === undefined || y === undefined || level === undefined) return undefined;
    const normalized: PlayerLocationSnapshot = {
        x,
        y,
        level,
    };
    const orientation = finiteInteger(snapshot.orientation);
    if (orientation !== undefined) {
        normalized.orientation = orientation & MAX_ROTATION;
    }
    const rotation = finiteInteger(snapshot.rot);
    if (rotation !== undefined) {
        normalized.rot = rotation & MAX_ROTATION;
    }
    return normalized;
}

function sanitizeBankSnapshot(entries: BankSnapshotEntry[] | undefined): BankSnapshotEntry[] {
    if (!Array.isArray(entries)) return [];
    const bySlot = new Map<number, BankSnapshotEntry>();
    for (const entry of entries) {
        if (!isRecord(entry)) continue;
        const slot = rangedInteger(entry.slot, 0, DEFAULT_BANK_CAPACITY - 1);
        const itemId = positiveId(entry.itemId);
        const quantity = stackQuantity(entry.quantity, true);
        if (slot === undefined || itemId === undefined || quantity === undefined) continue;
        const placeholder = entry.placeholder === true;
        const filler = entry.filler === true;
        if (quantity === 0 && !placeholder && !filler) continue;
        bySlot.set(slot, {
            slot,
            itemId,
            quantity,
            placeholder,
            filler,
            tab: clampedInteger(entry.tab, 0, MAX_BANK_TAB) ?? 0,
        });
    }
    return Array.from(bySlot.values()).sort((left, right) => left.slot - right.slot);
}

function sanitizeInstanceGraveSnapshot(
    data: PlayerPersistentVars["instanceGrave"] | undefined,
): PlayerPersistentVars["instanceGrave"] | undefined {
    if (!isRecord(data) || !Array.isArray(data.items)) return undefined;

    const items: Array<{ itemId: number; quantity: number }> = [];
    for (const item of data.items) {
        if (!isRecord(item)) continue;
        const itemId = positiveId(item.itemId);
        const quantity = stackQuantity(item.quantity);
        if (itemId !== undefined && quantity !== undefined) {
            items.push({ itemId, quantity });
        }
    }
    if (items.length === 0) return undefined;

    const result: NonNullable<PlayerPersistentVars["instanceGrave"]> = { items };
    const reclaimCost = clampedInteger(data.reclaimCost, 0, MAX_STACK_QUANTITY);
    if (reclaimCost !== undefined && reclaimCost > 0) result.reclaimCost = reclaimCost;

    if (isRecord(data.location) && isRecord(data.location.tile)) {
        const locId = positiveId(data.location.locId);
        const x = clampedInteger(data.location.tile.x, 0, MAX_TILE_COORD);
        const y = clampedInteger(data.location.tile.y, 0, MAX_TILE_COORD);
        const level = clampedInteger(data.location.level, 0, MAX_LOCATION_LEVEL);
        if (locId !== undefined && x !== undefined && y !== undefined && level !== undefined) {
            result.location = { locId, tile: { x, y }, level };
        }
    }
    return result;
}

function sanitizeCollectionLogSnapshot(
    data: PlayerPersistentVars["collectionLog"] | undefined,
): PlayerPersistentVars["collectionLog"] | undefined {
    if (!isRecord(data)) return undefined;

    const result: NonNullable<PlayerPersistentVars["collectionLog"]> = {};

    if (Array.isArray(data.items)) {
        const itemsById = new Map<number, { itemId: number; quantity: number }>();
        for (const item of data.items) {
            if (!isRecord(item)) continue;
            const itemId = positiveId(item.itemId);
            const quantity = stackQuantity(item.quantity);
            if (itemId === undefined || quantity === undefined) continue;
            itemsById.set(itemId, { itemId, quantity });
        }
        const sanitizedItems = Array.from(itemsById.values()).sort(
            (left, right) => left.itemId - right.itemId,
        );
        if (sanitizedItems.length > 0) {
            result.items = sanitizedItems;
        }
    }

    if (Array.isArray(data.itemUnlocks)) {
        const unlocksByItemId = new Map<number, SanitizedCollectionLogUnlockEntry>();
        for (const entry of data.itemUnlocks) {
            if (!isRecord(entry)) continue;
            const itemId = positiveId(entry.itemId);
            const runeDay = rangedInteger(entry.runeDay, 0, MAX_STACK_QUANTITY);
            const sequence = rangedInteger(entry.sequence, 1, MAX_STACK_QUANTITY);
            if (itemId === undefined || runeDay === undefined || sequence === undefined) continue;
            const normalized = { itemId, runeDay, sequence };
            const existing = unlocksByItemId.get(itemId);
            if (!existing || normalized.sequence > existing.sequence) {
                unlocksByItemId.set(itemId, normalized);
            }
        }
        const sanitizedItemUnlocks = Array.from(unlocksByItemId.values()).sort(
            (left, right) => left.sequence - right.sequence,
        );
        if (sanitizedItemUnlocks.length > 0) {
            result.itemUnlocks = sanitizedItemUnlocks;
        }
    }

    if (Array.isArray(data.categoryStats)) {
        const statsByStructId = new Map<number, SanitizedCollectionLogCategoryStat>();
        for (const stat of data.categoryStats) {
            if (!isRecord(stat)) continue;
            const structId = rangedInteger(stat.structId, 0, MAX_STACK_QUANTITY);
            const count1 = clampedInteger(stat.count1, 0, MAX_STACK_QUANTITY);
            if (structId === undefined || count1 === undefined) continue;
            const entry: SanitizedCollectionLogCategoryStat = {
                structId,
                count1,
            };
            const count2 = clampedInteger(stat.count2, 0, MAX_STACK_QUANTITY);
            const count3 = clampedInteger(stat.count3, 0, MAX_STACK_QUANTITY);
            if (count2 !== undefined) entry.count2 = count2;
            if (count3 !== undefined) entry.count3 = count3;
            statsByStructId.set(structId, entry);
        }
        const sanitizedStats = Array.from(statsByStructId.values()).sort(
            (left, right) => left.structId - right.structId,
        );
        if (sanitizedStats.length > 0) {
            result.categoryStats = sanitizedStats;
        }
    }

    // Return undefined if nothing was sanitized
    if (!result.items && !result.itemUnlocks && !result.categoryStats) return undefined;
    return result;
}

export function mergePlayerPersistentVars(
    defaults?: PlayerPersistentVars,
    overrides?: PlayerPersistentVars,
): PlayerPersistentVars | undefined {
    const safeDefaults = isRecord(defaults) ? (defaults as PlayerPersistentVars) : undefined;
    const safeOverrides = isRecord(overrides) ? (overrides as PlayerPersistentVars) : undefined;
    if (!safeDefaults && !safeOverrides) return undefined;
    const varps: Record<number, number> = {};
    const varbits: Record<number, number> = {};
    let gamemodeData: Record<string, unknown> | undefined;
    const sources: PlayerPersistentVars[] = [safeDefaults ?? {}, safeOverrides ?? {}];
    for (const source of sources) {
        if (isRecord(source.varps)) {
            for (const [key, value] of Object.entries(source.varps)) {
                if (!/^(0|[1-9]\d*)$/.test(key)) continue;
                const id = rangedInteger(Number(key), 0, MAX_STACK_QUANTITY);
                const normalizedValue = clampedInteger(
                    value,
                    MIN_SIGNED_INTEGER,
                    MAX_STACK_QUANTITY,
                );
                if (id !== undefined && normalizedValue !== undefined) {
                    varps[id] = normalizedValue;
                }
            }
        }
        if (isRecord(source.varbits)) {
            for (const [key, value] of Object.entries(source.varbits)) {
                if (!/^(0|[1-9]\d*)$/.test(key)) continue;
                const id = rangedInteger(Number(key), 0, MAX_STACK_QUANTITY);
                const normalizedValue = clampedInteger(value, 0, MAX_STACK_QUANTITY);
                if (id !== undefined && normalizedValue !== undefined) {
                    varbits[id] = normalizedValue;
                }
            }
        }
        // Merge gamemodeData (shallow merge, latest source wins per key)
        if (isRecord(source.gamemodeData)) {
            gamemodeData = { ...(gamemodeData ?? {}), ...source.gamemodeData };
        }
    }
    const result: PlayerPersistentVars = {};
    const displayMode = rangedInteger(safeOverrides?.preferredDisplayMode ?? safeDefaults?.preferredDisplayMode, 0, 2);
    if (displayMode !== undefined) result.preferredDisplayMode = displayMode;
    if (Object.keys(varps).length > 0) result.varps = varps;
    if (Object.keys(varbits).length > 0) result.varbits = varbits;
    if (gamemodeData && Object.keys(gamemodeData).length > 0) {
        result.gamemodeData = gamemodeData;
    }
    const bankSource = safeOverrides?.bank ?? safeDefaults?.bank;
    if (bankSource !== undefined) {
        result.bank = sanitizeBankSnapshot(bankSource);
    }
    const bankCapacitySource = safeOverrides?.bankCapacity ?? safeDefaults?.bankCapacity;
    const normalizedBankCapacity = clampedInteger(
        bankCapacitySource,
        1,
        DEFAULT_BANK_CAPACITY,
    );
    if (normalizedBankCapacity !== undefined) {
        // Existing accounts may have been saved under an older, smaller bank
        // limit. Raise them to the current default on load instead of leaving
        // those players permanently constrained by the legacy capacity.
        result.bankCapacity = Math.max(DEFAULT_BANK_CAPACITY, normalizedBankCapacity);
    } else if (result.bank) {
        result.bankCapacity = DEFAULT_BANK_CAPACITY;
    }
    const bankPlaceholders = safeOverrides?.bankPlaceholders ?? safeDefaults?.bankPlaceholders;
    if (typeof bankPlaceholders === "boolean") {
        result.bankPlaceholders = bankPlaceholders;
    }
    const bankWithdrawNotes = safeOverrides?.bankWithdrawNotes ?? safeDefaults?.bankWithdrawNotes;
    if (typeof bankWithdrawNotes === "boolean") {
        result.bankWithdrawNotes = bankWithdrawNotes;
    }
    const bankInsertMode = safeOverrides?.bankInsertMode ?? safeDefaults?.bankInsertMode;
    if (typeof bankInsertMode === "boolean") {
        result.bankInsertMode = bankInsertMode;
    }
    const bankQuantityMode = clampedInteger(
        safeOverrides?.bankQuantityMode ?? safeDefaults?.bankQuantityMode,
        0,
        5,
    );
    if (bankQuantityMode !== undefined) {
        result.bankQuantityMode = bankQuantityMode;
    }
    const bankQuantityCustom = clampedInteger(
        safeOverrides?.bankQuantityCustom ?? safeDefaults?.bankQuantityCustom,
        0,
        MAX_STACK_QUANTITY,
    );
    if (bankQuantityCustom !== undefined) {
        result.bankQuantityCustom = bankQuantityCustom;
    }
    const bankCurrentTab = clampedInteger(
        safeOverrides?.bankCurrentTab ?? safeDefaults?.bankCurrentTab,
        0,
        15,
    );
    if (bankCurrentTab !== undefined) {
        result.bankCurrentTab = bankCurrentTab;
    }
    const bankTabDisplayMode = clampedInteger(
        safeOverrides?.bankTabDisplayMode ?? safeDefaults?.bankTabDisplayMode,
        0,
        3,
    );
    if (bankTabDisplayMode !== undefined) {
        result.bankTabDisplayMode = bankTabDisplayMode;
    }

    const inventorySource =
        safeOverrides && Object.prototype.hasOwnProperty.call(safeOverrides, "inventory")
            ? safeOverrides.inventory
            : safeDefaults?.inventory;
    if (inventorySource !== undefined) {
        result.inventory = sanitizeInventorySnapshot(inventorySource) ?? [];
    }

    const equipmentSource =
        safeOverrides && Object.prototype.hasOwnProperty.call(safeOverrides, "equipment")
            ? safeOverrides.equipment
            : safeDefaults?.equipment;
    if (equipmentSource !== undefined) {
        result.equipment = sanitizeEquipmentSnapshot(equipmentSource) ?? [];
    }

    const pick = <K extends keyof PlayerPersistentVars>(
        key: K,
    ): PlayerPersistentVars[K] | undefined => {
        if (safeOverrides && Object.prototype.hasOwnProperty.call(safeOverrides, key)) {
            return safeOverrides[key];
        }
        return safeDefaults?.[key];
    };

    const skillsSource = pick("skills");
    if (skillsSource !== undefined) {
        result.skills = sanitizeSkillsSnapshot(skillsSource) ?? [];
    }

    // Project-specific onboarding/character design state
    const accountStage = clampedInteger(pick("accountStage"), 0, 10);
    if (accountStage !== undefined) {
        result.accountStage = accountStage;
    }
    const preferredMode = pick("preferredMode");
    const starterLoadoutGranted = pick("starterLoadoutGranted");
    if (typeof starterLoadoutGranted === "boolean") result.starterLoadoutGranted = starterLoadoutGranted;
    if (preferredMode === "vanilla" || preferredMode === "leagues") {
        result.preferredMode = preferredMode;
    }
    const accountCreationTimeMs = clampedInteger(
        pick("accountCreationTimeMs"),
        0,
        Number.MAX_SAFE_INTEGER,
    );
    if (accountCreationTimeMs !== undefined) {
        result.accountCreationTimeMs = accountCreationTimeMs;
    }
    const appearanceSource = pick("appearance");
    if (isRecord(appearanceSource)) {
        const apOut: NonNullable<PlayerPersistentVars["appearance"]> = {};
        const gender = finiteInteger(appearanceSource.gender);
        if (gender !== undefined) {
            apOut.gender = gender === 1 ? 1 : 0;
        }
        if (Array.isArray(appearanceSource.kits)) {
            apOut.kits = appearanceSource.kits
                .slice(0, 7)
                .map((value) => finiteInteger(value) ?? -1);
        }
        if (Array.isArray(appearanceSource.colors)) {
            apOut.colors = appearanceSource.colors
                .slice(0, 5)
                .map((value) => finiteInteger(value) ?? 0);
        }
        if (
            Object.prototype.hasOwnProperty.call(apOut, "gender") ||
            Object.prototype.hasOwnProperty.call(apOut, "kits") ||
            Object.prototype.hasOwnProperty.call(apOut, "colors")
        ) {
            result.appearance = apOut;
        }
    }

    const hpSource = clampedInteger(pick("hitpoints"), 0, MAX_STACK_QUANTITY);
    if (hpSource !== undefined) {
        result.hitpoints = hpSource;
    }

    const location = sanitizeLocationSnapshot(pick("location"));
    if (location) {
        result.location = location;
    }

    const runEnergy = clampedInteger(pick("runEnergy"), 0, MAX_RUN_ENERGY);
    if (runEnergy !== undefined) {
        result.runEnergy = runEnergy;
    }

    const runToggle = pick("runToggle");
    if (typeof runToggle === "boolean") {
        result.runToggle = runToggle;
    }

    const autoRetaliate = pick("autoRetaliate");
    if (typeof autoRetaliate === "boolean") {
        result.autoRetaliate = autoRetaliate;
    }

    const playTimeSeconds = clampedInteger(
        pick("playTimeSeconds"),
        0,
        Number.MAX_SAFE_INTEGER,
    );
    if (playTimeSeconds !== undefined) {
        result.playTimeSeconds = playTimeSeconds;
    }

    const combatStyleSlot = clampedInteger(pick("combatStyleSlot"), 0, 3);
    if (combatStyleSlot !== undefined) {
        result.combatStyleSlot = combatStyleSlot;
    }

    const combatStyleCategory = clampedInteger(
        pick("combatStyleCategory"),
        0,
        MAX_STACK_QUANTITY,
    );
    if (combatStyleCategory !== undefined) {
        result.combatStyleCategory = combatStyleCategory;
    }

    const combatSpellId = positiveId(pick("combatSpellId"));
    if (combatSpellId !== undefined) {
        result.combatSpellId = combatSpellId;
    }

    const autocastEnabled = pick("autocastEnabled");
    if (typeof autocastEnabled === "boolean") {
        result.autocastEnabled = autocastEnabled;
    }

    const autocastMode = pick("autocastMode");
    if (
        autocastMode === "autocast" ||
        autocastMode === "defensive_autocast" ||
        autocastMode === null
    ) {
        result.autocastMode = autocastMode ?? null;
    }

    const specialEnergy = clampedInteger(pick("specialEnergy"), 0, MAX_SPECIAL_ENERGY);
    if (specialEnergy !== undefined) {
        result.specialEnergy = specialEnergy;
    }

    const quickPrayersSource = pick("quickPrayers");
    if (Array.isArray(quickPrayersSource)) {
        result.quickPrayers = Array.from(
            new Set(
                quickPrayersSource.filter(
                    (entry): entry is PrayerName =>
                        typeof entry === "string" && PRAYER_NAME_SET.has(entry as PrayerName),
                ),
            ),
        );
    }

    const equipmentChargesSource = pick("equipmentCharges");
    if (Array.isArray(equipmentChargesSource)) {
        const chargesByItemId = new Map<number, { itemId: number; charges: number }>();
        for (const entry of equipmentChargesSource) {
            if (!isRecord(entry)) continue;
            const itemId = positiveId(entry.itemId);
            const charges = stackQuantity(entry.charges);
            if (itemId === undefined || charges === undefined) continue;
            chargesByItemId.set(itemId, { itemId, charges });
        }
        const equipmentCharges = Array.from(chargesByItemId.values()).sort(
            (left, right) => left.itemId - right.itemId,
        );
        if (equipmentCharges.length > 0) result.equipmentCharges = equipmentCharges;
    }

    const specialActivated = pick("specialActivated");
    if (typeof specialActivated === "boolean") {
        result.specialActivated = specialActivated;
    }

    const followerSource = pick("follower");
    if (isRecord(followerSource)) {
        const itemId = positiveId(followerSource.itemId);
        const npcTypeId = positiveId(followerSource.npcTypeId);
        if (itemId !== undefined && npcTypeId !== undefined) {
            result.follower = {
                itemId,
                npcTypeId,
            };
        }
    }

    const firstPetDrops = pick("firstPetDrops");
    if (Array.isArray(firstPetDrops)) result.firstPetDrops = sanitizeFirstPetDrops(firstPetDrops);
    const pendingPets = pick("pendingPetRewards");
    if (Array.isArray(pendingPets)) {
        result.pendingPetRewards = pendingPets.flatMap(reward => {
            if (!isRecord(reward)) return [];
            const itemId = positiveId(reward.itemId);
            const quantity = stackQuantity(reward.quantity);
            return itemId !== undefined && quantity !== undefined ? [{ itemId, quantity }] : [];
        });
    }

    // Collection log snapshots are replaced as a unit by an account override.
    const collectionLogSource = pick("collectionLog");
    const sanitizedCollectionLog = sanitizeCollectionLogSnapshot(collectionLogSource);
    if (sanitizedCollectionLog) {
        result.collectionLog = sanitizedCollectionLog;
    }

    // Degradation charges (crystal bow, etc.)
    const degradationSource = pick("degradationCharges");
    if (Array.isArray(degradationSource)) {
        const degradationBySlot = new Map<
            number,
            { slot: number; itemId: number; charges: number }
        >();
        for (const entry of degradationSource) {
            if (!isRecord(entry)) continue;
            const slot = rangedInteger(entry.slot, 0, DEFAULT_EQUIP_SLOT_COUNT - 1);
            const itemId = positiveId(entry.itemId);
            const charges = stackQuantity(entry.charges);
            if (slot === undefined) continue;
            if (itemId === undefined || charges === undefined) continue;
            degradationBySlot.set(slot, { slot, itemId, charges });
        }
        const sanitizedDegradation = Array.from(degradationBySlot.values()).sort(
            (left, right) => left.slot - right.slot,
        );
        if (sanitizedDegradation.length > 0) {
            result.degradationCharges = sanitizedDegradation;
        }
    }

    const instanceGrave = sanitizeInstanceGraveSnapshot(pick("instanceGrave"));
    if (instanceGrave) result.instanceGrave = instanceGrave;
    // Explicit null must replace older progress, not merge it back after abandonment.
    const raidCheckpoint = pick("raidCheckpoint");
    if (raidCheckpoint !== undefined) result.raidCheckpoint = sanitizeRaidCheckpoint(raidCheckpoint) ?? null;
    const moonProgress = pick("moonProgress");
    if (moonProgress !== undefined) result.moonProgress = sanitizeMoonProgress(moonProgress);
    const pendingLoot = pick("pendingLoot");
    if (pendingLoot !== undefined) result.pendingLoot = sanitizePendingLoot(pendingLoot);

    return result;
}

export type { PersistenceProvider };

export interface PlayerPersistenceOptions {
    dataDir?: string;
    databasePath?: string;
    defaultsPath?: string;
}

type PlayerPersistenceStatements = Readonly<{
    selectExists: StatementSync;
    selectReadableState: StatementSync;
    upsertState: StatementSync;
}>;

/**
 * Default SQLite-backed persistence provider.
 * Stores each player state as an independent row per gamemode.
 */
export class PlayerPersistence implements PersistenceProvider {
    private readonly defaults: PlayerPersistentVars | undefined;
    private readonly defaultsPath: string;
    private readonly database: SqliteDatabase;
    readonly theatreRuns: TheatreRunStore;
    private readonly statements: PlayerPersistenceStatements;

    constructor(options: PlayerPersistenceOptions = {}) {
        const dataDir = options.dataDir ? path.resolve(options.dataDir) : DEFAULT_DATA_DIR;
        this.defaultsPath = options.defaultsPath
            ? path.resolve(options.defaultsPath)
            : path.join(dataDir, "player-defaults.json");
        this.database = getSqliteDatabase({ dataDir, databasePath: options.databasePath });
        const connection = this.database.connection;
        connection.exec(`CREATE TABLE IF NOT EXISTS theatre_runs (
            run_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL
        )`);
        const loadRun = connection.prepare("SELECT state_json FROM theatre_runs WHERE run_id = ?");
        const saveRun = connection.prepare(`INSERT INTO theatre_runs (run_id,state_json,updated_at) VALUES (?,?,?)
            ON CONFLICT(run_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`);
        this.theatreRuns = {
            load: id => {
                const row = loadRun.get(id) as {state_json:string} | undefined;
                if (!row) return undefined;
                try { return sanitizeTheatreRun(JSON.parse(row.state_json)); } catch { return undefined; }
            },
            save: run => {
                const valid = sanitizeTheatreRun(run);
                if (!valid) throw new Error("Invalid Theatre run record");
                saveRun.run(valid.id,JSON.stringify(valid),new Date().toISOString());
            },
            claim: (run,player,expected) => {
                const key=player.__saveKey;
                if(!key)throw new Error("Theatre claim requires a saved account");
                connection.exec("BEGIN IMMEDIATE");
                try {
                    const current=this.theatreRuns.load(run.id);
                    const index=current?.roster.indexOf(key.trim().toLowerCase()) ?? -1;
                    const reward=current?.rewards?.[index];
                    const requested=run.rewards?.[index];
                    if(!current || current.completedRooms!==6 || !reward || reward.claimed || !requested || !sanitizeTheatreRun(run))
                        throw new Error("Theatre reward already claimed or changed");
                    if (expected) {
                        const immutable = (r: typeof reward) => ({unique:r.unique,items:r.items,pet:r.pet});
                        if(JSON.stringify(expected)!==JSON.stringify(reward) ||
                            JSON.stringify(immutable(requested))!==JSON.stringify(immutable(reward)) || !requested.received ||
                            requested.received.some((n,i)=>n<(reward.received?.[i]??0)))
                            throw new Error("Stale Theatre claim");
                    } else if (!requested.claimed || JSON.stringify({...requested,claimed:false})!==JSON.stringify(reward)) {
                        throw new Error("Theatre reward already claimed or changed");
                    }
                    // Preserve teammates' independent claims in the same transaction.
                    current.rewards![index]=structuredClone(requested);
                    this.theatreRuns.save(current);
                    this.saveSnapshot(key,player);
                    connection.exec("COMMIT");
                } catch(error){try{connection.exec("ROLLBACK");}catch{}throw error;}
            },
        };
        this.statements = {
            selectExists: connection.prepare(
                "SELECT 1 FROM player_states WHERE account_name = ?",
            ),
            // Keep legacy/corrupt rows out of JavaScript entirely. The database
            // trigger protects new writes, while this predicate also protects
            // installations that already contain an oversized or non-text row.
            selectReadableState: connection.prepare(
                `SELECT state_json AS stateJson
                 FROM player_states
                 WHERE account_name = ?
                   AND typeof(state_json) = 'text'
                   AND length(CAST(state_json AS BLOB)) <= ${MAX_PLAYER_STATE_JSON_BYTES}`,
            ),
            upsertState: connection.prepare(
                `INSERT INTO player_states (account_name, state_json, updated_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT(account_name) DO UPDATE SET
                    state_json = excluded.state_json,
                    updated_at = excluded.updated_at`,
            ),
        };
        this.defaults = readJsonFile<PlayerPersistentVars | undefined>(
            this.defaultsPath,
            undefined,
        );
    }

    applyToPlayer(player: PlayerState, key: string): void {
        const snapshot = mergePlayerPersistentVars(this.defaults, this.getSnapshot(key));
        player.applyPersistentVars(snapshot);
    }

    hasKey(key: string): boolean {
        return this.statements.selectExists.get(key) !== undefined;
    }

    saveSnapshot(key: string, player: PlayerState): void {
        const snapshot = player.exportPersistentVars();
        this.upsertSnapshot(key, snapshot, new Date().toISOString());
    }

    savePlayers(entries: Array<{ key: string; player: PlayerState }>): void {
        if (!entries || entries.length === 0) return;
        const now = new Date().toISOString();
        this.database.connection.exec("BEGIN IMMEDIATE");
        try {
            for (const entry of entries) {
                this.upsertSnapshot(entry.key, entry.player.exportPersistentVars(), now);
            }
            this.database.connection.exec("COMMIT");
        } catch (err) {
            try {
                this.database.connection.exec("ROLLBACK");
            } catch {
                // The original error is more useful to callers.
            }
            throw err;
        }
    }

    private getSnapshot(key: string): PlayerPersistentVars | undefined {
        const row = this.statements.selectReadableState.get(key) as
            | { stateJson?: unknown }
            | undefined;
        if (!row || typeof row.stateJson !== "string") return undefined;
        try {
            return JSON.parse(row.stateJson) as PlayerPersistentVars;
        } catch {
            return undefined;
        }
    }

    private upsertSnapshot(key: string, snapshot: PlayerPersistentVars, updatedAt: string): void {
        this.statements.upsertState.run(key, JSON.stringify(snapshot), updatedAt);
    }
}
