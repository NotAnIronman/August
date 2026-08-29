import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const serverRoot = path.join(repositoryRoot, "apps", "server");

const mappings = [
    [path.join(serverRoot, "gamemodes"), "@server/content/gamemodes"],
    [path.join(serverRoot, "extrascripts"), "@server/content/modules"],
    [path.join(serverRoot, "src"), "@server"],
];

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const ignoredDirectories = new Set(["node_modules", "build", "dist", "coverage", "var"]);
const files = [];

function discover(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            discover(absolute);
        } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
            files.push(absolute);
        }
    }
}

function mapSpecifier(sourceFile, specifier) {
    if (!specifier.startsWith(".")) return undefined;
    const resolved = path.resolve(path.dirname(sourceFile), specifier);
    for (const [sourceRoot, alias] of mappings) {
        const relative = path.relative(sourceRoot, resolved);
        if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
        const suffix = relative.split(path.sep).join("/");
        return suffix ? `${alias}/${suffix}` : alias;
    }
    return undefined;
}

discover(serverRoot);

const modulePattern =
    /\b(?:from\s+|import\s*\(\s*|require(?:\.resolve)?\s*\(\s*)(["'])([^"']+)\1/g;
let changed = 0;

for (const sourceFile of files) {
    const original = fs.readFileSync(sourceFile, "utf8");
    const updated = original.replace(modulePattern, (match, quote, specifier) => {
        const replacement = mapSpecifier(sourceFile, specifier);
        return replacement
            ? match.replace(`${quote}${specifier}${quote}`, `${quote}${replacement}${quote}`)
            : match;
    });
    if (updated === original) continue;
    fs.writeFileSync(sourceFile, updated);
    changed += 1;
}

console.log(`Rewrote server module specifiers in ${changed} files.`);
