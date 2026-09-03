import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

function parseArgs(args) {
    const options = {
        directory: undefined,
        excludes: new Set(),
        only: new Set(),
        isolation: "worker",
        timeoutMs: 120_000,
        repeat: 1,
        order: "forward",
    };
    for (const arg of args) {
        if (arg.startsWith("--exclude=")) {
            options.excludes.add(arg.slice("--exclude=".length));
        } else if (arg.startsWith("--only=")) {
            options.only.add(arg.slice("--only=".length));
        } else if (arg.startsWith("--isolation=")) {
            options.isolation = arg.slice("--isolation=".length);
        } else if (arg.startsWith("--timeout-ms=")) {
            options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
        } else if (arg.startsWith("--repeat=")) {
            options.repeat = Number(arg.slice("--repeat=".length));
        } else if (arg.startsWith("--order=")) {
            options.order = arg.slice("--order=".length);
        } else if (!options.directory) {
            options.directory = arg;
        } else {
            throw new Error(`Unexpected argument: ${arg}`);
        }
    }
    if (!options.directory) throw new Error("Usage: run-typescript-tests.mjs <directory>");
    if (options.isolation !== "worker" && options.isolation !== "process") {
        throw new Error("--isolation must be worker or process");
    }
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
        throw new Error("--timeout-ms must be a positive integer");
    }
    if (!Number.isSafeInteger(options.repeat) || options.repeat <= 0) {
        throw new Error("--repeat must be a positive integer");
    }
    if (options.order !== "forward" && options.order !== "reverse") {
        throw new Error("--order must be forward or reverse");
    }
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
if (options.order === "reverse") selected.reverse();

if (selected.length === 0) throw new Error(`No tests selected from ${testDirectory}`);

console.log(
    `Running ${selected.length} TypeScript test files sequentially ` +
        `with ${options.isolation} isolation` +
        `${options.repeat > 1 ? ` for ${options.repeat} passes` : ""}` +
        `${options.order === "reverse" ? " in reverse order" : ""}...`,
);
const failures = [];

function runInProcess(testPath, testName) {
    const result = spawnSync(process.execPath, ["--import", tsxLoader, testPath], {
        cwd: packageRoot,
        env: process.env,
        stdio: "inherit",
        timeout: options.timeoutMs,
        killSignal: "SIGTERM",
    });
    if (result.error?.code === "ETIMEDOUT") {
        console.error(`Test timed out after ${options.timeoutMs} ms: ${testName}`);
    } else if (result.error) {
        console.error(result.error);
    }
    return !result.error && result.status === 0;
}

function runInWorker(testPath, testName) {
    return new Promise((resolve) => {
        let workerError;
        let worker;
        let timedOut = false;
        let settled = false;
        let timeout;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            resolve(result);
        };
        try {
            worker = new Worker(pathToFileURL(testPath), {
                env: process.env,
                execArgv: ["--import", tsxLoader],
            });
        } catch (error) {
            finish({ code: 1, error, timedOut: false });
            return;
        }
        worker.once("error", (error) => {
            workerError = error;
        });
        worker.once("exit", (code) => finish({ code, error: workerError, timedOut }));
        timeout = setTimeout(() => {
            timedOut = true;
            console.error(`Test timed out after ${options.timeoutMs} ms: ${testName}`);
            void worker.terminate().finally(() => {
                finish({ code: 1, error: workerError, timedOut: true });
            });
        }, options.timeoutMs);
    });
}

function isTransientWorkerFailure(error) {
    return (
        error?.code === "EPERM" ||
        error?.code === "EAGAIN" ||
        error?.code === "EBUSY" ||
        error?.code === "ERR_WORKER_INIT_FAILED"
    );
}

async function runInWorkerWithRetry(testPath, testName) {
    const maximumAttempts = 3;
    for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
        const result = await runInWorker(testPath, testName);
        if (!result.timedOut && !result.error && result.code === 0) return true;
        if (result.timedOut || !isTransientWorkerFailure(result.error) || attempt === maximumAttempts) {
            if (result.error) console.error(result.error);
            return false;
        }
        const delayMs = 100 * 2 ** (attempt - 1);
        console.warn(
            `Worker startup was temporarily unavailable (${result.error.code}); ` +
                `retrying in ${delayMs} ms (${attempt}/${maximumAttempts}).`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
}

const totalRuns = selected.length * options.repeat;
let runIndex = 0;
for (let pass = 1; pass <= options.repeat; pass += 1) {
    for (const testName of selected) {
        runIndex += 1;
        const passLabel = options.repeat > 1 ? ` (pass ${pass}/${options.repeat})` : "";
        console.log(`\n[${runIndex}/${totalRuns}] ${testName}${passLabel}`);
        const testPath = path.join(testDirectory, testName);
        const passed =
            options.isolation === "worker"
                ? await runInWorkerWithRetry(testPath, testName)
                : runInProcess(testPath, testName);
        if (!passed) failures.push(`${testName}${passLabel}`);
    }
}

if (failures.length > 0) {
    console.error(`\n${failures.length} test run(s) failed: ${failures.join(", ")}`);
    process.exitCode = 1;
} else {
    console.log(`\nAll ${totalRuns} test runs passed.`);
}
