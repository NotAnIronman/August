#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const applicationsRoot = path.join(repositoryRoot, "apps");
const toolsRoot = path.join(repositoryRoot, "tools");
const errors = [];
let checkedApplicationFiles = 0;
let checkedApplicationImports = 0;
let skippedApplicationTestFiles = 0;

const requiredDirectories = [
    "apps/client",
    "apps/docs",
    "apps/server",
    "data/catalogs/client",
    "data/catalogs/server",
    "data/generated",
    "data/references",
    "packages/custom-content",
    "packages/game-model",
    "packages/osrs-engine",
    "packages/protocol",
    "tools/cache",
    "tools/data",
    "tools/diagnostics",
    "tools/lib",
    "tools/migrations",
    "tools/repository",
    "tools/testing",
];

const requiredFiles = [
    "README.md",
    "CONTRIBUTING.md",
    "data/README.md",
    "data/catalogs/client/sprite-names.json",
    "tools/README.md",
    "tools/package.json",
    "apps/client/package.json",
    "apps/docs/package.json",
    "apps/server/package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
];

const forbiddenPaths = [
    "client",
    "docs",
    "references",
    "scripts",
    "server",
    "apps/client/locs",
    "apps/client/npcs",
    "apps/client/scripts",
    "apps/client/public/spriteNames.json",
    "apps/server/cache",
    "apps/server/caches",
    "apps/server/data",
    "apps/server/logs",
    "apps/server/scripts",
];

const permittedRootDirectories = new Set([
    ".cursor",
    ".git",
    ".github",
    ".pnpm-store",
    ".tmp",
    "apps",
    "data",
    "node_modules",
    "packages",
    "tools",
]);

const ignoredWalkDirectories = new Set([
    ".git",
    ".pnpm-store",
    ".tmp",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "var",
]);

const obsoleteLockfiles = new Set([
    "bun.lock",
    "bun.lockb",
    "npm-shrinkwrap.json",
    "package-lock.json",
    "yarn.lock",
]);

const applicationSourceExtensions = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
]);

function absolute(relativePath) {
    return path.join(repositoryRoot, ...relativePath.split("/"));
}

function report(code, relativePath, message) {
    errors.push(`${relativePath} [${code}] ${message}`);
}

function toPosix(filePath) {
    return filePath.split(path.sep).join("/");
}

function relativeToRoot(filePath) {
    return toPosix(path.relative(repositoryRoot, filePath));
}

function isInside(child, parent) {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function matchesModuleRoot(specifier, moduleRoot) {
    return specifier === moduleRoot || specifier.startsWith(`${moduleRoot}/`);
}

export function isExplicitTestSource(filePath, sourceRoot) {
    const relativeParts = path.relative(sourceRoot, filePath).split(path.sep);
    const fileName = relativeParts.at(-1) ?? "";
    return (
        relativeParts.includes("__tests__") ||
        relativeParts.includes("tests") ||
        /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(fileName)
    );
}

function literalModuleSpecifier(node) {
    return ts.isStringLiteralLike(node) ? node.text : undefined;
}

function isImportMeta(node) {
    return (
        ts.isMetaProperty(node) &&
        node.keywordToken === ts.SyntaxKind.ImportKeyword &&
        node.name.text === "meta"
    );
}

/**
 * Parse imports with the TypeScript syntax tree so comments, example strings,
 * JSX text, and formatting cannot create false positives. Type-only/static
 * imports, re-exports, dynamic imports, CommonJS require calls, and explicit
 * module resolution calls all participate in the same boundary policy.
 */
export function applicationImportSpecifiers(filePath, source) {
    const sourceFile = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true,
    );
    const imports = [];
    const seen = new Set();

    function add(node, literal) {
        const specifier = literal ? literalModuleSpecifier(literal) : undefined;
        if (specifier === undefined) return;
        const position = node.getStart(sourceFile);
        const key = `${position}:${specifier}`;
        if (seen.has(key)) return;
        seen.add(key);
        imports.push({
            specifier,
            line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
        });
    }

    function visit(node) {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
            add(node, node.moduleSpecifier);
        } else if (
            ts.isImportEqualsDeclaration(node) &&
            ts.isExternalModuleReference(node.moduleReference)
        ) {
            add(node, node.moduleReference.expression);
        } else if (ts.isCallExpression(node)) {
            const expression = node.expression;
            const isDynamicImport = expression.kind === ts.SyntaxKind.ImportKeyword;
            const isRequire = ts.isIdentifier(expression) && expression.text === "require";
            const isRequireResolve =
                ts.isPropertyAccessExpression(expression) &&
                ts.isIdentifier(expression.expression) &&
                expression.expression.text === "require" &&
                expression.name.text === "resolve";
            const isModuleRequire =
                ts.isPropertyAccessExpression(expression) &&
                ts.isIdentifier(expression.expression) &&
                expression.expression.text === "module" &&
                expression.name.text === "require";
            const isImportMetaResolve =
                ts.isPropertyAccessExpression(expression) &&
                isImportMeta(expression.expression) &&
                expression.name.text === "resolve";
            if (
                isDynamicImport ||
                isRequire ||
                isRequireResolve ||
                isModuleRequire ||
                isImportMetaResolve
            ) {
                add(node, node.arguments[0]);
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return imports;
}

function applicationDescriptors() {
    if (!existsSync(applicationsRoot)) return [];
    return readdirSync(applicationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
            const root = path.join(applicationsRoot, entry.name);
            const manifestPath = path.join(root, "package.json");
            let packageName;
            if (existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
                    if (typeof manifest.name === "string") packageName = manifest.name;
                } catch {
                    // The manifest validation below owns the actionable parse error.
                }
            }
            return {
                name: entry.name,
                alias: `@${entry.name}`,
                packageName,
                root,
                sourceRoot: path.join(root, "src"),
            };
        });
}

function pathBoundaryViolation(targetPath, currentApplication, applications, specifier) {
    if (isInside(targetPath, toolsRoot)) {
        return {
            code: "runtime-tool-import",
            message: `runtime source may not import maintenance tooling: ${specifier}`,
        };
    }
    for (const application of applications) {
        if (application.name === currentApplication.name) continue;
        if (isInside(targetPath, application.root)) {
            return {
                code: "cross-app-relative-import",
                message: `${currentApplication.name} runtime may not import ${application.name} application source: ${specifier}`,
            };
        }
    }
    return undefined;
}

/** Return the application-boundary violation for one import, if any. */
export function applicationImportViolation({
    filePath,
    specifier,
    currentApplication,
    applications,
}) {
    const normalized = specifier.replaceAll("\\", "/");

    if (
        matchesModuleRoot(normalized, "@tools") ||
        matchesModuleRoot(normalized, "@august/tools") ||
        matchesModuleRoot(normalized, "tools")
    ) {
        return {
            code: "runtime-tool-import",
            message: `runtime source may not import maintenance tooling: ${specifier}`,
        };
    }

    if (matchesModuleRoot(normalized, currentApplication.alias)) {
        const relativeAliasTarget = normalized.slice(currentApplication.alias.length + 1);
        if (relativeAliasTarget) {
            const violation = pathBoundaryViolation(
                path.resolve(currentApplication.sourceRoot, relativeAliasTarget),
                currentApplication,
                applications,
                specifier,
            );
            if (violation) return violation;
        }
    }

    const pathLikeSpecifier = normalized.split(/[?#]/, 1)[0];
    if (pathLikeSpecifier.startsWith(".")) {
        const violation = pathBoundaryViolation(
            path.resolve(path.dirname(filePath), pathLikeSpecifier),
            currentApplication,
            applications,
            specifier,
        );
        if (violation) return violation;
    } else if (path.isAbsolute(pathLikeSpecifier)) {
        const violation = pathBoundaryViolation(
            path.resolve(pathLikeSpecifier),
            currentApplication,
            applications,
            specifier,
        );
        if (violation) return violation;
    } else if (pathLikeSpecifier.startsWith("file:")) {
        try {
            const violation = pathBoundaryViolation(
                fileURLToPath(pathLikeSpecifier),
                currentApplication,
                applications,
                specifier,
            );
            if (violation) return violation;
        } catch {
            // Invalid file URLs are owned by the compiler/runtime, not this check.
        }
    }

    for (const application of applications) {
        if (application.name === currentApplication.name) continue;
        if (matchesModuleRoot(normalized, application.alias)) {
            return {
                code: "cross-app-private-alias",
                message: `${currentApplication.name} runtime may not import ${application.name}'s private alias: ${specifier}`,
            };
        }
        if (application.packageName && matchesModuleRoot(normalized, application.packageName)) {
            return {
                code: "cross-app-package-import",
                message: `${currentApplication.name} runtime may not import the private ${application.name} application package: ${specifier}`,
            };
        }
        const appRootSpecifier = `apps/${application.name}`;
        const shortSourceSpecifier = `${application.name}/src`;
        const embeddedAppRoot = `/apps/${application.name}/`;
        if (
            matchesModuleRoot(normalized, appRootSpecifier) ||
            matchesModuleRoot(normalized, shortSourceSpecifier) ||
            normalized.includes(embeddedAppRoot) ||
            normalized.endsWith(`/apps/${application.name}`)
        ) {
            return {
                code: "cross-app-source-import",
                message: `${currentApplication.name} runtime may not import ${application.name} application source: ${specifier}`,
            };
        }
    }

    if (normalized.includes("/tools/") || normalized.endsWith("/tools")) {
        return {
            code: "runtime-tool-import",
            message: `runtime source may not import maintenance tooling: ${specifier}`,
        };
    }
    return undefined;
}

function validateApplicationImports() {
    const applications = applicationDescriptors();
    const runtimeApplications = applications.filter((application) =>
        existsSync(application.sourceRoot),
    );
    for (const application of runtimeApplications) {
        walk(application.sourceRoot, (filePath) => {
            if (!applicationSourceExtensions.has(path.extname(filePath))) return;
            if (isExplicitTestSource(filePath, application.sourceRoot)) {
                skippedApplicationTestFiles++;
                return;
            }
            checkedApplicationFiles++;
            const source = readFileSync(filePath, "utf8");
            for (const { specifier, line } of applicationImportSpecifiers(filePath, source)) {
                checkedApplicationImports++;
                const violation = applicationImportViolation({
                    filePath,
                    specifier,
                    currentApplication: application,
                    applications,
                });
                if (!violation) continue;
                report(
                    violation.code,
                    `${relativeToRoot(filePath)}:${line}`,
                    violation.message,
                );
            }
        });
    }
    return runtimeApplications.length;
}

function walk(directory, callback) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredWalkDirectories.has(entry.name)) continue;
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(entryPath, callback);
        else callback(entryPath, entry.name);
    }
}

for (const relativePath of requiredDirectories) {
    if (!existsSync(absolute(relativePath))) {
        report("missing-directory", relativePath, "required architectural boundary is missing");
    }
}

for (const relativePath of requiredFiles) {
    if (!existsSync(absolute(relativePath))) {
        report("missing-file", relativePath, "required repository entrypoint is missing");
    }
}

for (const relativePath of forbiddenPaths) {
    if (existsSync(absolute(relativePath))) {
        report("legacy-path", relativePath, "obsolete pre-monorepo path must not return");
    }
}

for (const entry of readdirSync(repositoryRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !permittedRootDirectories.has(entry.name)) {
        report("unknown-root", entry.name, "top-level directories must have a documented role");
    }
}

walk(repositoryRoot, (filePath, fileName) => {
    if (obsoleteLockfiles.has(fileName)) {
        const relativePath = path.relative(repositoryRoot, filePath).split(path.sep).join("/");
        report("obsolete-lockfile", relativePath, "pnpm-lock.yaml is the only dependency lockfile");
    }
});

const checkedApplicationRoots = validateApplicationImports();

const packageNames = new Map([
    ["apps/client/package.json", "@august/client"],
    ["apps/docs/package.json", "@august/docs"],
    ["apps/server/package.json", "@august/server"],
    ["tools/package.json", "@august/tools"],
]);
for (const [relativePath, expectedName] of packageNames) {
    try {
        const manifest = JSON.parse(readFileSync(absolute(relativePath), "utf8"));
        if (manifest.name !== expectedName) {
            report("package-name", relativePath, `expected workspace name ${expectedName}`);
        }
    } catch (error) {
        report(
            "invalid-manifest",
            relativePath,
            error instanceof Error ? error.message : String(error),
        );
    }
}

if (errors.length > 0) {
    console.error(`Repository structure check failed with ${errors.length} error(s):`);
    for (const error of errors.sort()) console.error(`- ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Repository structure check passed (${requiredDirectories.length} boundaries, one pnpm lockfile, ` +
            `${checkedApplicationRoots} runtime application roots, ${checkedApplicationFiles} source files, ` +
            `${checkedApplicationImports} imports, ${skippedApplicationTestFiles} colocated test files exempted).`,
    );
}
