import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

function parseArgs(args) {
    const options = { directory: undefined, excludes: new Set(), only: new Set() };
    for (const arg of args) {
        if (arg.startsWith("--exclude=")) {
            options.excludes.add(arg.slice("--exclude=".length));
        } else if (arg.startsWith("--only=")) {
            options.only.add(arg.slice("--only=".length));
        } else if (!options.directory) {
            options.directory = arg;
        } else {
            throw new Error(`Unexpected argument: ${arg}`);
        }
    }
    if (!options.directory) throw new Error("Usage: run-typescript-tests.mjs <directory>");
    return options;
}

function discoverTests(directory, current = directory) {
    const tests = [];
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
            tests.push(...discoverTests(directory, absolute));
        } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
            tests.push(path.relative(directory, absolute).split(path.sep).join("/"));
        }
    }
    return tests.sort((left, right) => left.localeCompare(right));
}

function resolveRequestedTest(requested, discovered) {
    const normalized = requested.split(path.sep).join("/");
    if (discovered.includes(normalized)) return normalized;
    const basenameMatches = discovered.filter((test) => path.posix.basename(test) === normalized);
    if (basenameMatches.length === 1) return basenameMatches[0];
    if (basenameMatches.length > 1) {
        throw new Error(
            `Requested test basename is ambiguous: ${requested} (${basenameMatches.join(", ")})`,
        );
    }
    throw new Error(`Requested test file was not discovered: ${requested}`);
}

const options = parseArgs(process.argv.slice(2));
const packageRoot = process.cwd();
const testDirectory = path.resolve(packageRoot, options.directory);
const packageRequire = createRequire(path.join(packageRoot, "package.json"));
const tsxLoader = pathToFileURL(packageRequire.resolve("tsx")).href;
const discovered = discoverTests(testDirectory);
const resolvedOnly = new Set([...options.only].map((name) => resolveRequestedTest(name, discovered)));
const resolvedExcludes = new Set(
    [...options.excludes].map((name) => resolveRequestedTest(name, discovered)),
);
const selected = discovered.filter(
    (name) =>
        !resolvedExcludes.has(name) && (resolvedOnly.size === 0 || resolvedOnly.has(name)),
);

if (selected.length === 0) throw new Error(`No tests selected from ${testDirectory}`);

console.log(`Running ${selected.length} TypeScript test files sequentially...`);
const failures = [];

for (const [index, testName] of selected.entries()) {
    console.log(`\n[${index + 1}/${selected.length}] ${testName}`);
    const result = spawnSync(
        process.execPath,
        ["--import", tsxLoader, path.join(testDirectory, testName)],
        {
            cwd: packageRoot,
            env: process.env,
            stdio: "inherit",
        },
    );

    if (result.error) {
        console.error(result.error);
        failures.push(testName);
    } else if (result.status !== 0) {
        failures.push(testName);
    }
}

if (failures.length > 0) {
    console.error(`\n${failures.length} test file(s) failed: ${failures.join(", ")}`);
    process.exitCode = 1;
} else {
    console.log(`\nAll ${selected.length} test files passed.`);
}
