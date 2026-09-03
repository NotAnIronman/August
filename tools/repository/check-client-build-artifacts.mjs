#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultBuildRoot = path.join(repositoryRoot, "apps", "client", "build");
export const DEFAULT_MAIN_GZIP_LIMIT_BYTES = 1024 * 1024;

function walkFiles(directoryPath) {
    const files = [];
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(entryPath));
        else if (entry.isFile()) files.push(entryPath);
    }
    return files;
}

export function parseMainGzipLimit(value) {
    if (value === undefined || value.trim() === "") return DEFAULT_MAIN_GZIP_LIMIT_BYTES;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error("CLIENT_MAIN_GZIP_LIMIT_BYTES must be a positive integer");
    }
    return parsed;
}

export function auditClientBuildArtifacts({
    buildRoot = defaultBuildRoot,
    mainGzipLimitBytes = DEFAULT_MAIN_GZIP_LIMIT_BYTES,
} = {}) {
    const issues = [];
    if (!existsSync(buildRoot) || !statSync(buildRoot).isDirectory()) {
        return {
            issues: [`client build output is missing: ${buildRoot}`],
            mainFile: undefined,
            mainBytes: 0,
            mainGzipBytes: 0,
        };
    }

    const files = walkFiles(buildRoot);
    const sourceMaps = files.filter((filePath) => filePath.toLowerCase().endsWith(".map"));
    if (sourceMaps.length > 0) {
        issues.push(`production output contains ${sourceMaps.length} source map(s)`);
    }

    const javascriptFiles = files.filter((filePath) => filePath.toLowerCase().endsWith(".js"));
    const sourceMapReferences = javascriptFiles.filter((filePath) =>
        /[#@]\s*sourceMappingURL\s*=/.test(readFileSync(filePath, "utf8")),
    );
    if (sourceMapReferences.length > 0) {
        issues.push(
            `production JavaScript contains ${sourceMapReferences.length} source-map reference(s)`,
        );
    }

    const mainCandidates = javascriptFiles.filter((filePath) =>
        /^main(?:\.[a-z0-9]+)?\.js$/i.test(path.basename(filePath)),
    );
    if (mainCandidates.length !== 1) {
        issues.push(`expected exactly one main JavaScript artifact, found ${mainCandidates.length}`);
        return {
            issues,
            mainFile: undefined,
            mainBytes: 0,
            mainGzipBytes: 0,
        };
    }

    const mainFile = mainCandidates[0];
    const main = readFileSync(mainFile);
    const mainGzipBytes = gzipSync(main, { level: 9 }).byteLength;
    if (mainGzipBytes > mainGzipLimitBytes) {
        issues.push(
            `main bundle is ${mainGzipBytes} gzip bytes; limit is ${mainGzipLimitBytes} bytes`,
        );
    }

    return {
        issues,
        mainFile,
        mainBytes: main.byteLength,
        mainGzipBytes,
    };
}

function main() {
    let mainGzipLimitBytes;
    try {
        mainGzipLimitBytes = parseMainGzipLimit(process.env.CLIENT_MAIN_GZIP_LIMIT_BYTES);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
    }

    const result = auditClientBuildArtifacts({ mainGzipLimitBytes });
    if (result.issues.length > 0) {
        console.error(`Client build artifact check failed with ${result.issues.length} error(s):`);
        for (const issue of result.issues) console.error(`- ${issue}`);
        process.exitCode = 1;
        return;
    }

    console.log(
        `Client build artifact check passed (${result.mainBytes} raw bytes, ` +
            `${result.mainGzipBytes} gzip bytes, ${mainGzipLimitBytes} byte limit).`,
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
