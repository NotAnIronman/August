#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const ignoredDirectories = new Set([
    ".git",
    ".pnpm-store",
    ".tmp",
    ".vitepress",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "temp",
    "tmp",
    "var",
]);
const ignoredRootDirectories = new Set([
    ".agents",
    ".claude",
    ".codex",
    ".cursor",
    "server",
    "sqlite-transfer",
]);
const externalScheme = /^[a-z][a-z0-9+.-]*:/i;
const windowsAbsolutePath = /^[a-z]:[\\/]/i;
const inlineLink = /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
const referenceLink = /^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm;

function toPosix(filePath) {
    return filePath.split(path.sep).join("/");
}

function walk(directoryPath, entries = [], repositoryRoot = directoryPath) {
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
        const entryPath = path.join(directoryPath, entry.name);
        const isRepositoryRootEntry = directoryPath === repositoryRoot;
        if (
            entry.isDirectory() &&
            (ignoredDirectories.has(entry.name) ||
                (isRepositoryRootEntry && ignoredRootDirectories.has(entry.name)))
        ) {
            continue;
        }
        if (entry.isDirectory()) {
            entries.push({ path: entryPath, isDirectory: true });
            walk(entryPath, entries, repositoryRoot);
        } else if (entry.isFile()) {
            entries.push({ path: entryPath, isDirectory: false });
        }
    }
    return entries;
}

export function extractDocumentationTargets(source) {
    const linkSource = source
        .replace(/^\s*(```|~~~)[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "")
        .replace(/`[^`\r\n]*`/g, "");
    const targets = [];
    for (const pattern of [inlineLink, referenceLink]) {
        pattern.lastIndex = 0;
        for (const match of linkSource.matchAll(pattern)) targets.push(match[1]);
    }
    return targets;
}

function cleanTarget(rawTarget) {
    const target = rawTarget.startsWith("<") && rawTarget.endsWith(">")
        ? rawTarget.slice(1, -1)
        : rawTarget;
    if (
        !target ||
        target.startsWith("#") ||
        target.startsWith("//") ||
        (externalScheme.test(target) && !windowsAbsolutePath.test(target))
    ) {
        return undefined;
    }
    return target.split(/[?#]/, 1)[0];
}

function candidatePaths(repositoryRoot, sourcePath, target) {
    const docsRoot = path.join(repositoryRoot, "apps", "docs");
    const sourceIsDocumentationPage =
        sourcePath === docsRoot || sourcePath.startsWith(`${docsRoot}${path.sep}`);
    const targetRoot = target.startsWith("/")
        ? sourceIsDocumentationPage
            ? docsRoot
            : repositoryRoot
        : path.dirname(sourcePath);
    const relativeTarget = target.startsWith("/") ? target.slice(1) : target;
    const resolved = path.resolve(targetRoot, relativeTarget);
    const candidates = [resolved];
    if (!path.extname(resolved)) {
        candidates.push(`${resolved}.md`, path.join(resolved, "index.md"));
    }
    return candidates;
}

function pathIsInside(candidate, parent) {
    const relative = path.relative(parent, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function auditDocumentationLinks(repositoryRoot = defaultRepositoryRoot) {
    const entries = walk(repositoryRoot, [], repositoryRoot);
    const actualPathByFoldedPath = new Map();
    for (const entry of entries) {
        actualPathByFoldedPath.set(path.resolve(entry.path).toLowerCase(), path.resolve(entry.path));
    }

    const markdownFiles = entries
        .filter((entry) => !entry.isDirectory && path.extname(entry.path).toLowerCase() === ".md")
        .map((entry) => entry.path)
        .sort((left, right) => left.localeCompare(right));
    const issues = [];
    let checkedLinks = 0;

    for (const sourcePath of markdownFiles) {
        const source = readFileSync(sourcePath, "utf8");
        for (const rawTarget of extractDocumentationTargets(source)) {
            const encodedTarget = cleanTarget(rawTarget);
            if (!encodedTarget) continue;
            checkedLinks++;
            const sourceName = toPosix(path.relative(repositoryRoot, sourcePath));
            if (encodedTarget.includes("\\")) {
                issues.push(`${sourceName} [backslash-link] ${rawTarget} must use forward slashes`);
                continue;
            }

            let target;
            try {
                target = decodeURIComponent(encodedTarget);
            } catch {
                issues.push(`${sourceName} [invalid-encoding] ${rawTarget}`);
                continue;
            }

            const candidates = candidatePaths(repositoryRoot, sourcePath, target);
            if (candidates.some((candidate) => !pathIsInside(candidate, repositoryRoot))) {
                issues.push(`${sourceName} [outside-repository] ${rawTarget}`);
                continue;
            }

            const match = candidates
                .map((candidate) => ({
                    requestedPath: path.resolve(candidate),
                    actualPath: actualPathByFoldedPath.get(path.resolve(candidate).toLowerCase()),
                }))
                .find((candidate) => candidate.actualPath !== undefined);
            if (!match?.actualPath) {
                issues.push(`${sourceName} [missing-target] ${rawTarget}`);
                continue;
            }

            if (match.requestedPath !== match.actualPath) {
                const expected = toPosix(path.relative(repositoryRoot, match.actualPath));
                issues.push(`${sourceName} [path-case] ${rawTarget} should resolve to ${expected}`);
                continue;
            }

            if (
                statSync(match.actualPath).isDirectory() &&
                !actualPathByFoldedPath.has(path.join(match.actualPath, "index.md").toLowerCase())
            ) {
                issues.push(`${sourceName} [directory-without-index] ${rawTarget}`);
            }
        }
    }

    return { checkedFiles: markdownFiles.length, checkedLinks, issues };
}

function main() {
    const result = auditDocumentationLinks();
    if (result.issues.length > 0) {
        console.error(`Documentation link check failed with ${result.issues.length} error(s):`);
        for (const issue of result.issues.sort()) console.error(`- ${issue}`);
        process.exitCode = 1;
        return;
    }
    console.log(
        `Documentation link check passed (${result.checkedFiles} Markdown files, ` +
            `${result.checkedLinks} local links).`,
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
