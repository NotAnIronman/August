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

function discoverTests(directory) {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
}

const options = parseArgs(process.argv.slice(2));
const packageRoot = process.cwd();
const testDirectory = path.resolve(packageRoot, options.directory);
const packageRequire = createRequire(path.join(packageRoot, "package.json"));
const tsxLoader = pathToFileURL(packageRequire.resolve("tsx")).href;
const discovered = discoverTests(testDirectory);
for (const requested of [...options.only, ...options.excludes]) {
    if (!discovered.includes(requested)) {
        throw new Error(`Requested test file was not discovered: ${requested}`);
    }
}
const selected = discovered.filter(
    (name) =>
        !options.excludes.has(name) && (options.only.size === 0 || options.only.has(name)),
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
