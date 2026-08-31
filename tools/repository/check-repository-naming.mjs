#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const governedRoots = ["apps", "packages", "tools", "data"];
const ignoredDirectories = new Set([
    ".git",
    ".cache",
    "node_modules",
    "build",
    "dist",
    "coverage",
    "var",
]);
const ambiguousDirectoryNames = new Set([
    "common",
    "shared",
    "utils",
    "helpers",
    "misc",
    "tmp",
    "temp",
    "old",
    "new",
    "final",
]);

const kebabName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const qualifiedKebabFile = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*\.[a-z0-9]+$/;
const sourceStem = /^(?:index|[A-Z][A-Za-z0-9]*|[a-z][A-Za-z0-9]*)(?:\.[a-z][a-z0-9]*)*$/;
const kebabSourceFile = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const exactExceptions = new Set([
    ".env.example",
    ".eslintrc.cjs",
    ".htaccess",
    "README.md",
    "package.json",
    "craco.config.js",
    "service-worker.js",
    "site.webmanifest",
]);

const errors = [];
let checkedDirectories = 0;
let checkedFiles = 0;

function toPosix(filePath) {
    return filePath.split(path.sep).join("/");
}

function relativeToRoot(filePath) {
    return toPosix(path.relative(repositoryRoot, filePath));
}

function report(filePath, code, message) {
    errors.push(`${relativeToRoot(filePath)} [${code}] ${message}`);
}

function isExternalNameException(fileName) {
    return /^LICENSE(?:-[A-Za-z0-9-]+)?(?:\.[A-Za-z0-9]+)?$/.test(fileName) ||
        /^RuneScape-(?:Bold|Plain)-\d+\.ttf$/.test(fileName);
}

function isTsconfig(fileName) {
    return /^tsconfig(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*\.json$/.test(fileName);
}

function isTestPath(relativePath) {
    return /\/(?:tests|__tests__)(?:\/|$)/.test(`/${relativePath}`) ||
        /\.(?:test|spec)\.[^.]+$/.test(relativePath);
}

function validateSourceFile(filePath, fileName, relativePath) {
    if (fileName.endsWith(".d.ts")) {
        const declarationStem = fileName.slice(0, -5);
        if (!kebabName.test(declarationStem) && !sourceStem.test(declarationStem)) {
            report(filePath, "declaration-name", "declaration files use a semantic camel/Pascal name or an external kebab module name");
        }
        return;
    }

    if (relativePath.startsWith("tools/")) {
        if (!kebabSourceFile.test(fileName)) {
            report(filePath, "tool-file-name", "tool source files use lowercase kebab-case, with dot-separated roles such as .test");
        }
        return;
    }

    const extension = path.extname(fileName);
    const stem = fileName.slice(0, -extension.length);
    if (isTestPath(relativePath) && kebabSourceFile.test(fileName)) return;
    if (!sourceStem.test(stem)) {
        report(filePath, "source-file-name", "source modules use PascalCase for a primary type/component or lowerCamelCase for a functional module");
    }
}

function validateFile(filePath) {
    checkedFiles++;
    const fileName = path.basename(filePath);
    const relativePath = relativeToRoot(filePath);
    if (exactExceptions.has(fileName) || isExternalNameException(fileName) || isTsconfig(fileName)) return;

    const extension = path.extname(fileName).toLowerCase();
    if (sourceExtensions.has(extension)) {
        validateSourceFile(filePath, fileName, relativePath);
        return;
    }
    if (extension === ".md") {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(fileName)) {
            report(filePath, "documentation-file-name", "documentation files use lowercase kebab-case (README.md is the boundary exception)");
        }
        return;
    }
    if (extension === ".css") {
        const stem = fileName.slice(0, -extension.length);
        if (!sourceStem.test(stem) && !kebabName.test(stem)) {
            report(filePath, "stylesheet-file-name", "stylesheets follow their component/module name or use lowercase kebab-case");
        }
        return;
    }
    if (!qualifiedKebabFile.test(fileName)) {
        report(filePath, "asset-file-name", "data, media, shader, and public assets use lowercase kebab-case with optional dot-separated roles");
    }
}

function validateDirectory(directoryPath) {
    const directoryName = path.basename(directoryPath);
    checkedDirectories++;
    if (!kebabName.test(directoryName) && !/^\.[a-z0-9]+(?:-[a-z0-9]+)*$/.test(directoryName)) {
        report(directoryPath, "directory-name", "directories use lowercase kebab-case");
    }
    if (ambiguousDirectoryNames.has(directoryName)) {
        report(directoryPath, "ambiguous-directory", "replace generic buckets with the domain and responsibility they actually own");
    }
}

function walk(directoryPath, isGovernedRoot = false) {
    if (!existsSync(directoryPath)) return;
    if (!isGovernedRoot) validateDirectory(directoryPath);
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            if (ignoredDirectories.has(entry.name)) continue;
            walk(absolutePath);
            continue;
        }
        if (entry.isSymbolicLink()) continue;
        if (statSync(absolutePath).isFile()) validateFile(absolutePath);
    }
}

for (const rootName of governedRoots) walk(path.join(repositoryRoot, rootName), true);

if (errors.length > 0) {
    console.error(`Repository naming check failed with ${errors.length} error(s):`);
    for (const error of errors.sort()) console.error(`- ${error}`);
    process.exitCode = 1;
} else {
    console.log(`Repository naming check passed (${checkedDirectories} directories, ${checkedFiles} files).`);
}
