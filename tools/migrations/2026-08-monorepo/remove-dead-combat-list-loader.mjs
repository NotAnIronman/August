import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const weaponDataPath = path.join(
    repositoryRoot,
    "apps",
    "server",
    "src",
    "content",
    "gamemodes",
    "vanilla",
    "data",
    "weapons.ts",
);

const original = fs.readFileSync(weaponDataPath, "utf8");
const startMarker = "const COMBAT_WEAPON_LIST_PATH =";
const endMarker = "appendGeneratedCombatWeaponEntries();";
const start = original.indexOf(startMarker);
const end = original.indexOf(endMarker, start);

if (start < 0 || end < 0) {
    throw new Error("Dead combat-list loader markers were not found exactly once");
}

const afterEnd = end + endMarker.length;
let updated = `${original.slice(0, start)}${original.slice(afterEnd)}`;
updated = updated.replace('import fs from "fs";\r\nimport path from "path";\r\n\r\n', "");
updated = updated.replace(
    'import {\r\n    type ItemDefinition,\r\n    type WeaponInterface,\r\n    loadItemDefinitions,\r\n} from "@server/game/scripts/types";',
    'import type { WeaponInterface } from "@august/game-model/items/ItemDefinition";',
);

fs.writeFileSync(weaponDataPath, updated);
console.log("Removed the unreachable Markdown-derived weapon loader.");
