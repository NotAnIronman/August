import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const serverRoot = path.join(repositoryRoot, "apps", "server");
const extensions = new Set([".ts", ".tsx", ".md"]);

const replacements = [
    // Normalizes output from the first development run of this migration.
    ["FallbackFallbackSpecialAttackProvider", "FallbackSpecialAttackProvider"],
    [
        "@server/game/combat/plugins/special-attacks/",
        "@server/game/combat/special-attacks/implementations/",
    ],
    [
        "@server/game/combat/plugins/SpecialAttackContainer",
        "@server/game/combat/special-attacks/WeaponSpecialAttackRegistry",
    ],
    [
        "@server/game/combat/plugins/WeaponSpecialAttackScript",
        "@server/game/combat/special-attacks/WeaponSpecialAttackScript",
    ],
    [
        "@server/game/combat/SpecialAttackProvider",
        "@server/game/combat/special-attacks/FallbackSpecialAttackProvider",
    ],
    [
        "@server/game/combat/SpecialAttackVisualProvider",
        "@server/game/combat/special-attacks/SpecialAttackVisualProvider",
    ],
    [
        "@server/game/combat/InstantUtilitySpecialProvider",
        "@server/game/combat/special-attacks/InstantUtilitySpecialProvider",
    ],
    [
        "@server/content/gamemodes/vanilla/combat/SpecialAttackRegistry",
        "@server/content/gamemodes/vanilla/combat/FallbackSpecialAttackCatalog",
    ],
    [
        "@server/content/gamemodes/vanilla/combat/SpecialAttackVisuals",
        "@server/content/gamemodes/vanilla/combat/SpecialAttackVisualCatalog",
    ],
    [
        "@server/content/gamemodes/vanilla/combat/RockKnockerSpecial",
        "@server/content/gamemodes/vanilla/combat/InstantUtilitySpecialCatalog",
    ],
    ["SpecialAttackContainer", "WeaponSpecialAttackRegistry", true],
    ["SpecialAttackRegistryImpl", "FallbackSpecialAttackCatalogImpl", true],
    ["createSpecialAttackProvider", "createFallbackSpecialAttackProvider", true],
    ["SpecialAttackProvider", "FallbackSpecialAttackProvider", true],
    ["SpecialAttackDef", "FallbackSpecialAttackDefinition", true],
    ["SpecialAttackEffect", "FallbackSpecialAttackEffect", true],
];

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function walk(directory, files = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "build") continue;
        const entryPath = path.join(directory, entry.name);
        // OneDrive exposes hydrated directories as reparse points, for which
        // Dirent.isDirectory() can be false on Windows. statSync follows them.
        if (fs.statSync(entryPath).isDirectory()) walk(entryPath, files);
        else if (extensions.has(path.extname(entry.name))) files.push(entryPath);
    }
    return files;
}

let changedFiles = 0;
let replacementCount = 0;
for (const filePath of walk(serverRoot)) {
    const source = fs.readFileSync(filePath, "utf8");
    let updated = source;
    for (const [from, to, wholeWord = false] of replacements) {
        if (wholeWord) {
            const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, "g");
            const matches = updated.match(pattern);
            if (!matches) continue;
            replacementCount += matches.length;
            updated = updated.replace(pattern, to);
            continue;
        }
        const pieces = updated.split(from);
        if (pieces.length === 1) continue;
        replacementCount += pieces.length - 1;
        updated = pieces.join(to);
    }
    if (updated === source) continue;
    fs.writeFileSync(filePath, updated);
    changedFiles++;
}

console.log(
    `Consolidated special-attack references (${replacementCount} replacements in ${changedFiles} files).`,
);
