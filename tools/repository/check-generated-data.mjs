#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const generatedRoot = path.join(repositoryRoot, "data", "generated");
const errors = [];
let checkedFiles = 0;
let checkedStrings = 0;

function generatedJsonFiles(directory = generatedRoot) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...generatedJsonFiles(absolutePath));
        else if (entry.isFile() && entry.name.endsWith(".json")) files.push(absolutePath);
    }
    return files.sort((left, right) => left.localeCompare(right));
}

function looksLikeDeveloperPath(value) {
    return (
        /^[a-z]:[\\/]/i.test(value) ||
        /^\\\\[^\\]+\\[^\\]+/.test(value) ||
        /^\/(?:home|users|tmp|var\/tmp|var\/folders|private\/var\/folders)\//i.test(value) ||
        /^\/mnt\/[a-z]\//i.test(value)
    );
}

function inspectStrings(value, filePath, jsonPath = "$") {
    if (typeof value === "string") {
        checkedStrings++;
        if (looksLikeDeveloperPath(value)) {
            errors.push(`${filePath} [local-path] ${jsonPath} contains a machine-specific absolute path`);
        }
        return;
    }
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
            inspectStrings(value[index], filePath, `${jsonPath}[${index}]`);
        }
        return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
        inspectStrings(child, filePath, `${jsonPath}.${key}`);
    }
}

for (const absolutePath of generatedJsonFiles()) {
    checkedFiles++;
    const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
    try {
        const source = readFileSync(absolutePath, "utf8");
        inspectStrings(JSON.parse(source), relativePath);
    } catch (error) {
        errors.push(
            `${relativePath} [invalid-json] ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

if (errors.length > 0) {
    console.error(`Generated-data check failed with ${errors.length} error(s):`);
    for (const error of errors.sort()) console.error(`- ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Generated-data check passed (${checkedFiles} JSON files, ${checkedStrings} string values).`,
    );
}
