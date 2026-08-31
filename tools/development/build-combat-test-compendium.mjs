import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const itemsPath = path.join(rootDir, "data", "generated", "server", "items.json");
const outputPath = path.join(rootDir, "data", "catalogs", "developer-combat-compendium.json");

const COMBAT_REQUIREMENT_COUNT = 7;
const MIN_COMBAT_LEVEL = 60;
const HIGH_END_BONUS = 60;

// These are the food definitions currently implemented by August that restore
// at least twelve hitpoints. Anglerfish is included because it reaches this
// threshold at normal high-level test accounts.
const HIGH_HEALING_FOOD_IDS = new Set([
    379, 365, 373, 7946, 3144, 385, 391, 11936, 13441, 2011, 6311,
]);

const TAB_BY_EQUIPMENT_TYPE = new Map([
    ["WEAPON", { tab: 0, category: "Weapons" }],
    ["ARROWS", { tab: 0, category: "Weapons and ammunition" }],
    ["AMMO", { tab: 0, category: "Weapons and ammunition" }],
    ["FULL_HELMET", { tab: 1, category: "Head armour" }],
    ["MED_HELMET", { tab: 1, category: "Head armour" }],
    ["HEAD", { tab: 1, category: "Head armour" }],
    ["HAT", { tab: 1, category: "Head armour" }],
    ["COIF", { tab: 1, category: "Head armour" }],
    ["PLATEBODY", { tab: 2, category: "Body armour" }],
    ["BODY", { tab: 2, category: "Body armour" }],
    ["LEGS", { tab: 3, category: "Leg armour" }],
    ["SHIELD", { tab: 3, category: "Shields" }],
    ["CAPE", { tab: 4, category: "Accessories" }],
    ["AMULET", { tab: 4, category: "Accessories" }],
    ["RING", { tab: 4, category: "Accessories" }],
    ["GLOVES", { tab: 4, category: "Accessories" }],
    ["BOOTS", { tab: 4, category: "Accessories" }],
]);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isFunctionalCombatGear(item) {
    if (!item || item.noted || !item.equipmentType || item.equipmentType === "NONE") return false;
    if (!TAB_BY_EQUIPMENT_TYPE.has(item.equipmentType)) return false;

    const requirements = Array.isArray(item.requirements) ? item.requirements : [];
    const hasCombatRequirement = requirements
        .slice(0, COMBAT_REQUIREMENT_COUNT)
        .some((level) => Number(level) >= MIN_COMBAT_LEVEL);
    const bonuses = Array.isArray(item.bonuses) ? item.bonuses : [];
    const hasHighEndCombatBonus = bonuses.some((bonus) => Number(bonus) >= HIGH_END_BONUS);
    return hasCombatRequirement || hasHighEndCombatBonus;
}

function supportedFourDosePotionIds() {
    const sourcePath = path.join(
        rootDir,
        "apps",
        "server",
        "src",
        "content",
        "gamemodes",
        "vanilla",
        "skills",
        "consumables",
        "index.ts",
    );
    const source = fs.readFileSync(sourcePath, "utf8");
    const ids = new Set();
    // Every supported four-dose drink starts with a definition whose next use
    // leaves three doses. Keeping this tied to the implemented consumable list
    // avoids false positives such as jewellery and waterskins named "(4)".
    for (const match of source.matchAll(/\{\s*itemId:\s*(\d+),[\s\S]{0,220}?dosesAfter:\s*3\s*[,}]/g)) {
        ids.add(Number(match[1]));
    }
    return ids;
}

function makeEntry(item, tab, category, quantity = 1) {
    return { itemId: item.id, name: item.name, quantity, tab, category };
}

const items = readJson(itemsPath);
const itemById = new Map(items.map((item) => [item.id, item]));
const entries = [];

for (const item of items) {
    if (!isFunctionalCombatGear(item)) continue;
    const placement = TAB_BY_EQUIPMENT_TYPE.get(item.equipmentType);
    entries.push(makeEntry(item, placement.tab, placement.category));
}

for (const itemId of supportedFourDosePotionIds()) {
    const item = itemById.get(itemId);
    if (item && !item.noted) entries.push(makeEntry(item, 5, "Four-dose potions", 25));
}

for (const itemId of HIGH_HEALING_FOOD_IDS) {
    const item = itemById.get(itemId);
    if (item && !item.noted) entries.push(makeEntry(item, 6, "Food healing 12+", 100));
}

entries.sort((a, b) => a.tab - b.tab || a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.itemId - b.itemId);
const duplicateIds = entries.filter((entry, index) => entries.findIndex((other) => other.itemId === entry.itemId) !== index);
if (duplicateIds.length) throw new Error(`Compendium contains duplicate item IDs: ${duplicateIds.map((entry) => entry.itemId).join(", ")}`);

const compendium = {
    schemaVersion: 1,
    criteria: {
        combatGear: "Equippable, unnoted gear with a combat requirement of 60+ or a high-end combat bonus of 60+.",
        potions: "Every four-dose consumable currently implemented by the server.",
        food: "Every currently implemented food that heals 12 or more hitpoints.",
    },
    defaultBankCapacity: 2000,
    entries,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(compendium, null, 2)}\n`, "utf8");
console.log(`Wrote ${entries.length} test-bank entries to ${path.relative(rootDir, outputPath)}.`);
