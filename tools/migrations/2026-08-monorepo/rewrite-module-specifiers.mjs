import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

const mappings = [
    ["client/common/CollisionFlag", "@august/game-model/collision/CollisionFlag", "exact"],
    ["client/common/Direction", "@august/game-model/movement/Direction", "exact"],
    ["client/common/instance", "@august/game-model/world/instance", "prefix"],
    ["client/common/vars", "@august/game-model/state/vars", "exact"],
    ["client/common/world", "@august/game-model/world", "prefix"],
    ["client/common/utils/FloatUtil", "@august/game-model/math/FloatUtil", "exact"],
    ["client/common/utils/MathUtil", "@august/game-model/math/MathUtil", "exact"],
    [
        "client/common/items/CacheItemSearchIndex",
        "@august/osrs-engine/config/objtype/CacheItemSearchIndex",
        "exact",
    ],
    ["client/common/chat/chatFormatting", "@client/game/chat/chatFormatting", "exact"],
    ["client/common/debug/PerfSnapshot", "@client/debug/PerfSnapshot", "exact"],
    ["client/common/collectionlog/custom", "@client/game/collection-log/custom", "exact"],
    [
        "client/common/collectionlog/collection-log.json",
        "@august/data/catalogs/collection-log.json",
        "exact",
    ],
    [
        "client/common/gamemode/GamemodeContentStore",
        "@client/game/content/GamemodeContentStore",
        "exact",
    ],
    ["client/common/utils/CacheManifest", "@client/game/cache/CacheManifest", "exact"],
    ["client/common/utils/DeviceUtil", "@client/ui/device/DeviceUtil", "exact"],
    ["client/common/utils/localStorage", "@client/game/storage/localStorage", "exact"],
    ["client/common/utils/StorageUtil", "@client/game/storage/StorageUtil", "exact"],
    ["client/common", "@august/protocol", "prefix"],
    ["client/rs/cs2", "@client/engine/cs2", "prefix"],
    ["client/rs", "@august/osrs-engine", "prefix"],
    ["client/custom/items", "@august/custom-content/items", "prefix"],
    ["client", "@client", "prefix"],
].map(([source, target, kind]) => ({
    source: path.resolve(repositoryRoot, source),
    target,
    kind,
}));

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const ignoredDirectories = new Set([
    ".git",
    ".pnpm-store",
    "node_modules",
    "build",
    "dist",
    "coverage",
    "var",
]);
const files = [];

function discover(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            discover(absolute);
        } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
            files.push(path.relative(repositoryRoot, absolute));
        }
    }
}

discover(repositoryRoot);
const modulePattern =
    /\b(?:from\s+|import\s*\(\s*|require(?:\.resolve)?\s*\(\s*)(["'])([^"']+)\1/g;
let changed = 0;

function resolveMapping(sourceFile, specifier) {
    if (!specifier.startsWith(".")) return undefined;
    const resolved = path.resolve(path.dirname(sourceFile), specifier);
    for (const mapping of mappings) {
        if (mapping.kind === "exact" && resolved === mapping.source) return mapping.target;
        if (mapping.kind !== "prefix") continue;
        const relative = path.relative(mapping.source, resolved);
        if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
        const suffix = relative.split(path.sep).join("/");
        return suffix ? `${mapping.target}/${suffix}` : mapping.target;
    }
    return undefined;
}

for (const relativeFile of files) {
    const sourceFile = path.resolve(repositoryRoot, relativeFile);
    const original = fs.readFileSync(sourceFile, "utf8");
    const updated = original.replace(modulePattern, (match, quote, specifier) => {
        const replacement = resolveMapping(sourceFile, specifier);
        return replacement
            ? match.replace(`${quote}${specifier}${quote}`, `${quote}${replacement}${quote}`)
            : match;
    });
    if (updated === original) continue;
    fs.writeFileSync(sourceFile, updated);
    changed += 1;
}

console.log(`Rewrote module specifiers in ${changed} files.`);
