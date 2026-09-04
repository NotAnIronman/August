import path from "node:path";
import { realpath, stat } from "node:fs/promises";

import type { Stats } from "node:fs";

export interface ResolvedStaticFile {
    readonly filePath: string;
    readonly fileStat: Stats;
}

const canonicalDirectoryPromises = new Map<string, Promise<string>>();

function isWithinDirectory(filePath: string, directory: string): boolean {
    const relative = path.relative(directory, filePath);
    return (
        relative === "" ||
        (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    );
}

async function canonicalDirectory(directory: string): Promise<string> {
    const resolved = path.resolve(directory);
    let pending = canonicalDirectoryPromises.get(resolved);
    if (!pending) {
        pending = realpath(resolved).catch((error) => {
            canonicalDirectoryPromises.delete(resolved);
            throw error;
        });
        canonicalDirectoryPromises.set(resolved, pending);
    }
    return pending;
}

/**
 * Resolve a regular file below a hosting root. Both lexical traversal and
 * symlink/junction escapes are rejected before the file is streamed.
 */
export async function resolveStaticFile(
    directory: string,
    relativePath: string,
): Promise<ResolvedStaticFile | undefined> {
    try {
        const resolvedDirectory = path.resolve(directory);
        const candidate = path.resolve(resolvedDirectory, relativePath);
        if (!isWithinDirectory(candidate, resolvedDirectory)) return undefined;

        const [realDirectory, realCandidate] = await Promise.all([
            canonicalDirectory(resolvedDirectory),
            realpath(candidate),
        ]);
        if (!isWithinDirectory(realCandidate, realDirectory)) return undefined;

        const fileStat = await stat(realCandidate);
        if (!fileStat.isFile()) return undefined;
        return { filePath: realCandidate, fileStat };
    } catch {
        return undefined;
    }
}
