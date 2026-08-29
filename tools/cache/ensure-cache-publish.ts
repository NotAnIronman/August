import fs from "node:fs";
import path from "node:path";

export type CachePublishOptions = Readonly<{
    targetCacheDir: string;
    stagingCacheDir: string;
    backupCacheDir: string;
    manifestPath: string;
    publishManifest: () => void;
    assertOwnership: () => void;
}>;

export type CacheManifestEntry = Readonly<{
    name: string;
    game: string;
    environment: string;
    revision: number;
    timestamp: string;
    size: number;
}>;

type ManifestSnapshot = Readonly<
    | { existed: true; contents: Buffer }
    | { existed: false }
>;

function validateSwapPaths(options: CachePublishOptions): {
    targetCacheDir: string;
    stagingCacheDir: string;
    backupCacheDir: string;
} {
    const targetCacheDir = path.resolve(options.targetCacheDir);
    const stagingCacheDir = path.resolve(options.stagingCacheDir);
    const backupCacheDir = path.resolve(options.backupCacheDir);
    const directories = [targetCacheDir, stagingCacheDir, backupCacheDir];

    if (new Set(directories).size !== directories.length) {
        throw new Error("Cache publish target, staging, and backup directories must be distinct");
    }

    const parent = path.dirname(targetCacheDir);
    if (directories.some((directory) => path.dirname(directory) !== parent)) {
        throw new Error("Cache publish target, staging, and backup directories must be siblings");
    }

    return { targetCacheDir, stagingCacheDir, backupCacheDir };
}

function snapshotManifest(manifestPath: string): ManifestSnapshot {
    if (!fs.existsSync(manifestPath)) return { existed: false };
    return { existed: true, contents: fs.readFileSync(manifestPath) };
}

function restoreManifest(manifestPath: string, snapshot: ManifestSnapshot): void {
    if (snapshot.existed) {
        fs.writeFileSync(manifestPath, snapshot.contents);
    } else {
        fs.rmSync(manifestPath, { force: true });
    }
}

/** Replace one named cache entry without discarding other installed revisions. */
export function writeMergedCacheManifest(
    manifestPath: string,
    cacheEntry: CacheManifestEntry,
): void {
    const resolvedManifestPath = path.resolve(manifestPath);
    let existingEntries: unknown[] = [];

    if (fs.existsSync(resolvedManifestPath)) {
        const parsed: unknown = JSON.parse(fs.readFileSync(resolvedManifestPath, "utf8"));
        if (!Array.isArray(parsed)) {
            throw new Error(`Cache manifest must contain an array: ${resolvedManifestPath}`);
        }
        existingEntries = parsed;
    }

    const retainedEntries = existingEntries.filter(
        (candidate) =>
            !candidate ||
            typeof candidate !== "object" ||
            (candidate as { name?: unknown }).name !== cacheEntry.name,
    );
    fs.writeFileSync(
        resolvedManifestPath,
        JSON.stringify([cacheEntry, ...retainedEntries]),
        "utf8",
    );
}

/**
 * Publish a validated staged cache while retaining enough state to restore the
 * previous target and manifest if any part of the handoff fails. All rename
 * paths are siblings so the swaps stay on one volume and work on Windows.
 */
export function publishStagedCache(options: CachePublishOptions): void {
    const { targetCacheDir, stagingCacheDir, backupCacheDir } = validateSwapPaths(options);
    const manifestPath = path.resolve(options.manifestPath);

    if (!fs.existsSync(stagingCacheDir)) {
        throw new Error(`Validated cache staging directory is missing: ${stagingCacheDir}`);
    }
    if (fs.existsSync(backupCacheDir)) {
        throw new Error(`Cache backup directory already exists: ${backupCacheDir}`);
    }

    const manifestSnapshot = snapshotManifest(manifestPath);
    let previousTargetMoved = false;
    let stagedTargetInstalled = false;
    let manifestPublicationStarted = false;

    try {
        options.assertOwnership();
        if (fs.existsSync(targetCacheDir)) {
            fs.renameSync(targetCacheDir, backupCacheDir);
            previousTargetMoved = true;
        }

        options.assertOwnership();
        fs.renameSync(stagingCacheDir, targetCacheDir);
        stagedTargetInstalled = true;

        options.assertOwnership();
        manifestPublicationStarted = true;
        options.publishManifest();
        options.assertOwnership();
    } catch (publishError) {
        const rollbackErrors: unknown[] = [];

        if (stagedTargetInstalled && fs.existsSync(targetCacheDir)) {
            try {
                fs.renameSync(targetCacheDir, stagingCacheDir);
            } catch (error) {
                rollbackErrors.push(error);
            }
        }

        if (previousTargetMoved && fs.existsSync(backupCacheDir)) {
            try {
                fs.renameSync(backupCacheDir, targetCacheDir);
            } catch (error) {
                rollbackErrors.push(error);
            }
        }

        if (manifestPublicationStarted) {
            try {
                restoreManifest(manifestPath, manifestSnapshot);
            } catch (error) {
                rollbackErrors.push(error);
            }
        }

        if (rollbackErrors.length > 0) {
            throw new AggregateError(
                [publishError, ...rollbackErrors],
                "Cache publication failed and rollback was incomplete",
            );
        }
        throw publishError;
    }

    // Publication is complete. The previous target remains recoverable until
    // both the replacement and its manifest have been installed successfully.
    if (previousTargetMoved) {
        fs.rmSync(backupCacheDir, { recursive: true, force: true });
    }
}
