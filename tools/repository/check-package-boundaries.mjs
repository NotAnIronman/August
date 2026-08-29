#!/usr/bin/env node

import { builtinModules } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packagesRoot = path.join(repositoryRoot, "packages");
const appsRoot = path.join(repositoryRoot, "apps");

const layers = [
    { directory: "game-model", name: "@august/game-model", allowed: [] },
    { directory: "protocol", name: "@august/protocol", allowed: ["@august/game-model"] },
    {
        directory: "osrs-engine",
        name: "@august/osrs-engine",
        allowed: ["@august/game-model", "@august/protocol"],
    },
    {
        directory: "custom-content",
        name: "@august/custom-content",
        allowed: ["@august/game-model", "@august/protocol", "@august/osrs-engine"],
    },
];

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const resolutionExtensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".d.ts"];
const ignoredDirectories = new Set(["node_modules", "dist", "build", "coverage", ".git"]);
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const errors = [];
let checkedFiles = 0;
let checkedImports = 0;

function toPosix(filePath) {
    return filePath.split(path.sep).join("/");
}

function relativeToRoot(filePath) {
    return toPosix(path.relative(repositoryRoot, filePath));
}

function report(filePath, line, code, message) {
    errors.push(`${relativeToRoot(filePath)}:${line} [${code}] ${message}`);
}

function readJson(filePath) {
    try {
        return JSON.parse(readFileSync(filePath, "utf8"));
    } catch (error) {
        report(filePath, 1, "invalid-json", error instanceof Error ? error.message : String(error));
        return undefined;
    }
}

function walkFiles(directory, files = []) {
    if (!existsSync(directory)) return files;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) walkFiles(absolutePath, files);
        else if (sourceExtensions.has(path.extname(entry.name))) files.push(absolutePath);
    }
    return files;
}

// Preserve strings and newlines while blanking comments. This avoids treating examples in
// comments as real imports without changing match offsets used for line-number reporting.
function stripComments(source) {
    const chars = [...source];
    let state = "code";
    for (let index = 0; index < chars.length; index++) {
        const char = chars[index];
        const next = chars[index + 1];
        if (state === "line-comment") {
            if (char === "\n") state = "code";
            else chars[index] = " ";
            continue;
        }
        if (state === "block-comment") {
            if (char === "*" && next === "/") {
                chars[index] = " ";
                chars[index + 1] = " ";
                index++;
                state = "code";
            } else if (char !== "\n" && char !== "\r") {
                chars[index] = " ";
            }
            continue;
        }
        if (state === "single" || state === "double" || state === "template") {
            const terminator = state === "single" ? "'" : state === "double" ? '"' : "`";
            if (char === "\\") index++;
            else if (char === terminator) state = "code";
            continue;
        }
        if (char === "/" && next === "/") {
            chars[index] = " ";
            chars[index + 1] = " ";
            index++;
            state = "line-comment";
        } else if (char === "/" && next === "*") {
            chars[index] = " ";
            chars[index + 1] = " ";
            index++;
            state = "block-comment";
        } else if (char === "'") {
            state = "single";
        } else if (char === '"') {
            state = "double";
        } else if (char === "`") {
            state = "template";
        }
    }
    return chars.join("");
}

function importSpecifiers(source) {
    const clean = stripComments(source);
    const matches = [];
    const patterns = [
        /\b(?:import|export)\s+(?:type\s+)?[^;]*?\bfrom\s*["']([^"']+)["']/g,
        /\bimport\s*["']([^"']+)["']/g,
        /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
    ];
    const seen = new Set();
    for (const pattern of patterns) {
        for (const match of clean.matchAll(pattern)) {
            const key = `${match.index}:${match[1]}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const line = clean.slice(0, match.index).split("\n").length;
            matches.push({ specifier: match[1], line });
        }
    }
    return matches;
}

function dependencyName(specifier) {
    if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
    return specifier.split("/")[0];
}

function packageLayerForSpecifier(specifier) {
    return layers.find((layer) => specifier === layer.name || specifier.startsWith(`${layer.name}/`));
}

function isInside(child, parent) {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveSourceTarget(basePath) {
    for (const extension of resolutionExtensions) {
        const candidate = `${basePath}${extension}`;
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    if (existsSync(basePath) && statSync(basePath).isDirectory()) {
        for (const extension of resolutionExtensions.slice(1)) {
            const candidate = path.join(basePath, `index${extension}`);
            if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
        }
    }
    return undefined;
}

function substituteExportPattern(key, target, requestedKey) {
    if (!key.includes("*")) return key === requestedKey ? target : undefined;
    const [prefix, suffix] = key.split("*");
    if (!requestedKey.startsWith(prefix) || !requestedKey.endsWith(suffix)) return undefined;
    const captured = requestedKey.slice(prefix.length, requestedKey.length - suffix.length);
    return target.replace("*", captured);
}

function exportedTarget(manifest, requestedKey) {
    const exportsMap = manifest.exports;
    if (!exportsMap || typeof exportsMap !== "object" || Array.isArray(exportsMap)) return undefined;
    for (const [key, rawTarget] of Object.entries(exportsMap)) {
        if (typeof rawTarget !== "string") continue;
        const target = substituteExportPattern(key, rawTarget, requestedKey);
        if (target) return target;
    }
    return undefined;
}

function validatePublicSpecifier(filePath, line, specifier, targetLayer, manifests) {
    const subpath = specifier === targetLayer.name ? "" : specifier.slice(targetLayer.name.length + 1);
    const requestedKey = subpath ? `./${subpath}` : ".";
    const manifest = manifests.get(targetLayer.name);
    const target = exportedTarget(manifest, requestedKey);
    if (!target) {
        report(filePath, line, "unexported-subpath", `${specifier} is not exposed by ${targetLayer.name}`);
        return;
    }
    if (target.includes("*") || !target.startsWith("./")) {
        report(filePath, line, "invalid-export-target", `${requestedKey} maps to invalid target ${target}`);
        return;
    }
    const packageRoot = path.join(packagesRoot, targetLayer.directory);
    const absoluteTarget = path.resolve(packageRoot, target);
    if (!isInside(absoluteTarget, packageRoot) || !existsSync(absoluteTarget)) {
        report(filePath, line, "missing-export-target", `${specifier} maps to missing ${target}`);
    }
}

function appPackageNames() {
    const names = new Set(["@august/client", "@august/server", "@august/docs"]);
    if (!existsSync(appsRoot)) return names;
    for (const entry of readdirSync(appsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(appsRoot, entry.name, "package.json");
        if (!existsSync(manifestPath)) continue;
        const manifest = readJson(manifestPath);
        if (typeof manifest?.name === "string") names.add(manifest.name);
    }
    return names;
}

function validateManifest(layer, manifest, manifestPath) {
    const packageRoot = path.dirname(manifestPath);
    if (manifest.name !== layer.name) report(manifestPath, 1, "package-name", `expected name ${layer.name}`);
    if (manifest.private !== true) report(manifestPath, 1, "package-private", "workspace packages must remain private");
    if (manifest.type !== "commonjs") report(manifestPath, 1, "package-type", 'expected "type": "commonjs"');
    if (manifest.main !== "src/index.ts" || manifest.types !== "src/index.ts") {
        report(manifestPath, 1, "package-entrypoint", "main and types must both point to src/index.ts");
    }
    if (manifest.scripts?.typecheck !== "tsc --noEmit -p tsconfig.json") {
        report(manifestPath, 1, "typecheck-script", "missing canonical package typecheck script");
    }
    const rootExport = exportedTarget(manifest, ".");
    if (rootExport !== "./src/index.ts") {
        report(manifestPath, 1, "root-export", "package root must export ./src/index.ts");
    }
    for (const [key, target] of Object.entries(manifest.exports ?? {})) {
        if (typeof target !== "string") {
            report(manifestPath, 1, "export-shape", `${key} must map directly to a source file`);
            continue;
        }
        if (!target.startsWith("./src/") || target.includes("..")) {
            report(manifestPath, 1, "export-scope", `${key} must remain within ./src`);
            continue;
        }
        if (key.includes("*") || target.includes("*")) {
            if (key !== "./*" || target !== "./src/*.ts") {
                report(manifestPath, 1, "wildcard-export", 'the source wildcard must be "./*": "./src/*.ts"');
            }
            continue;
        }
        const absoluteTarget = path.resolve(packageRoot, target);
        if (!isInside(absoluteTarget, packageRoot) || !existsSync(absoluteTarget)) {
            report(manifestPath, 1, "missing-export-target", `${key} maps to missing ${target}`);
        }
    }
    const declared = {
        ...manifest.dependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
        ...manifest.devDependencies,
    };
    for (const [name, version] of Object.entries(declared)) {
        const targetLayer = layers.find((candidate) => candidate.name === name);
        if (!targetLayer) continue;
        if (!layer.allowed.includes(name)) {
            report(manifestPath, 1, "manifest-direction", `${layer.name} may not depend on ${name}`);
        }
        if (version !== "workspace:*") {
            report(manifestPath, 1, "workspace-version", `${name} must use workspace:*`);
        }
    }
    const indexPath = path.join(packageRoot, "src", "index.ts");
    if (!existsSync(indexPath) || !/\bexport\b/.test(stripComments(readFileSync(indexPath, "utf8")))) {
        report(indexPath, 1, "empty-entrypoint", "src/index.ts must expose an intentional public surface");
    }
}

function validateWorkspaceCycles(manifests) {
    const graph = new Map();
    for (const layer of layers) {
        const manifest = manifests.get(layer.name);
        const declared = {
            ...manifest?.dependencies,
            ...manifest?.optionalDependencies,
            ...manifest?.peerDependencies,
            ...manifest?.devDependencies,
        };
        graph.set(
            layer.name,
            Object.keys(declared).filter((dependency) => manifests.has(dependency)),
        );
    }

    const state = new Map();
    const stack = [];
    const reported = new Set();

    function visit(packageName) {
        state.set(packageName, "visiting");
        stack.push(packageName);
        for (const dependency of graph.get(packageName) ?? []) {
            if (state.get(dependency) === "visiting") {
                const start = stack.indexOf(dependency);
                const cycle = [...stack.slice(start), dependency];
                const key = [...new Set(cycle.slice(0, -1))].sort().join("|");
                if (!reported.has(key)) {
                    reported.add(key);
                    const layer = layers.find((candidate) => candidate.name === packageName);
                    report(
                        path.join(packagesRoot, layer.directory, "package.json"),
                        1,
                        "package-cycle",
                        cycle.join(" -> "),
                    );
                }
            } else if (state.get(dependency) !== "visited") {
                visit(dependency);
            }
        }
        stack.pop();
        state.set(packageName, "visited");
    }

    for (const layer of layers) {
        if (!state.has(layer.name)) visit(layer.name);
    }
}

function validateTsconfig(layer) {
    const tsconfigPath = path.join(packagesRoot, layer.directory, "tsconfig.json");
    if (!existsSync(tsconfigPath)) {
        report(tsconfigPath, 1, "missing-tsconfig", "package tsconfig.json is required");
        return;
    }
    const config = readJson(tsconfigPath);
    if (!config) return;
    if (config.extends !== "../../tsconfig.base.json") {
        report(tsconfigPath, 1, "tsconfig-base", "package must extend ../../tsconfig.base.json");
    }
    const options = config.compilerOptions ?? {};
    if (options.noEmit !== true || options.strict !== true) {
        report(tsconfigPath, 1, "tsconfig-options", "package requires strict and noEmit");
    }
    if (options.module !== "Node16" || options.moduleResolution !== "Node16") {
        report(tsconfigPath, 1, "tsconfig-resolution", "source packages require Node16 module resolution");
    }
    if (!Array.isArray(config.include) || !config.include.includes("src/**/*.ts")) {
        report(tsconfigPath, 1, "tsconfig-include", "package must include src/**/*.ts");
    }
}

function validatePackageImports(layer, manifest, manifests, appNames) {
    const packageRoot = path.join(packagesRoot, layer.directory);
    const sourceRoot = path.join(packageRoot, "src");
    const declaredDependencies = {
        ...manifest.dependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
    };
    for (const filePath of walkFiles(sourceRoot)) {
        checkedFiles++;
        const source = readFileSync(filePath, "utf8");
        for (const { specifier, line } of importSpecifiers(source)) {
            checkedImports++;
            if (specifier.startsWith(".")) {
                const rawTarget = path.resolve(path.dirname(filePath), specifier);
                if (!isInside(rawTarget, packageRoot)) {
                    report(filePath, line, "relative-escape", `relative import escapes ${layer.name}: ${specifier}`);
                } else if (!resolveSourceTarget(rawTarget)) {
                    report(filePath, line, "missing-relative-import", `cannot resolve ${specifier}`);
                }
                continue;
            }
            if (path.isAbsolute(specifier)) {
                report(filePath, line, "absolute-import", `absolute import is forbidden: ${specifier}`);
                continue;
            }
            const targetLayer = packageLayerForSpecifier(specifier);
            if (targetLayer) {
                if (targetLayer.name !== layer.name && !layer.allowed.includes(targetLayer.name)) {
                    report(filePath, line, "dependency-direction", `${layer.name} may not import ${targetLayer.name}`);
                }
                if (targetLayer.name !== layer.name && !(targetLayer.name in declaredDependencies)) {
                    report(filePath, line, "undeclared-workspace-dependency", `${targetLayer.name} is not declared in dependencies`);
                }
                validatePublicSpecifier(filePath, line, specifier, targetLayer, manifests);
                continue;
            }
            const externalName = dependencyName(specifier);
            if (
                appNames.has(externalName) ||
                specifier === "@client" ||
                specifier.startsWith("@client/") ||
                /^(?:apps|client|server)\//.test(specifier)
            ) {
                report(filePath, line, "application-import", `${layer.name} may not import application code: ${specifier}`);
            } else if (specifier.startsWith("@august/")) {
                report(filePath, line, "unknown-august-package", `unknown internal package ${externalName}`);
            } else if (!builtins.has(specifier) && !(externalName in declaredDependencies)) {
                report(filePath, line, "undeclared-dependency", `${externalName} is not declared in dependencies`);
            }
        }
    }
}

function validateAppPackageImports(manifests) {
    for (const filePath of walkFiles(appsRoot)) {
        const source = readFileSync(filePath, "utf8");
        for (const { specifier, line } of importSpecifiers(source)) {
            const targetLayer = packageLayerForSpecifier(specifier);
            if (targetLayer) validatePublicSpecifier(filePath, line, specifier, targetLayer, manifests);
        }
    }
}

const manifests = new Map();
for (const layer of layers) {
    const manifestPath = path.join(packagesRoot, layer.directory, "package.json");
    if (!existsSync(manifestPath)) {
        report(manifestPath, 1, "missing-package", `missing package ${layer.name}`);
        continue;
    }
    const manifest = readJson(manifestPath);
    if (manifest) manifests.set(layer.name, manifest);
}

const appNames = appPackageNames();
validateWorkspaceCycles(manifests);
for (const layer of layers) {
    const manifest = manifests.get(layer.name);
    if (!manifest) continue;
    const manifestPath = path.join(packagesRoot, layer.directory, "package.json");
    validateManifest(layer, manifest, manifestPath);
    validateTsconfig(layer);
    validatePackageImports(layer, manifest, manifests, appNames);
}
validateAppPackageImports(manifests);

if (errors.length > 0) {
    console.error(`Package boundary check failed with ${errors.length} error(s):`);
    for (const error of errors.sort()) console.error(`- ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Package boundary check passed (${layers.length} packages, ${checkedFiles} package source files, ${checkedImports} imports).`,
    );
}
