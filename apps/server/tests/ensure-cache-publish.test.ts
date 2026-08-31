/**
 * Regression coverage for rollback-safe publication of a staged cache.
 *
 * Run with: pnpm exec tsx tests/ensure-cache-publish.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    publishStagedCache,
    writeMergedCacheManifest,
} from "@tools/cache/ensure-cache-publish";
import {
    isCacheInstallationValid,
    parseOpenRs2XteaKeys,
} from "@tools/cache/ensure-cache-validation";

function makeCache(cacheDir: string, marker: string): void {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "marker.txt"), marker, "utf8");
}

function readMarker(cacheDir: string): string {
    return fs.readFileSync(path.join(cacheDir, "marker.txt"), "utf8");
}

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "xrsps-cache-publish-test-"));

try {
    const validationRoot = path.join(testDirectory, "validation");
    fs.mkdirSync(validationRoot, { recursive: true });
    for (const cacheFile of [
        "main_file_cache.dat2",
        "main_file_cache.idx255",
        "main_file_cache.idx0",
    ]) {
        fs.writeFileSync(path.join(validationRoot, cacheFile), "cache-data", "utf8");
    }
    fs.writeFileSync(
        path.join(validationRoot, "info.json"),
        JSON.stringify({ valid_keys: 1 }),
        "utf8",
    );
    fs.writeFileSync(
        path.join(validationRoot, "keys.json"),
        JSON.stringify({ 42: [1, 2, 3, 4] }),
        "utf8",
    );
    assert.equal(isCacheInstallationValid(validationRoot), true);
    fs.writeFileSync(path.join(validationRoot, "keys.json"), "{}", "utf8");
    assert.equal(isCacheInstallationValid(validationRoot), false);
    fs.rmSync(path.join(validationRoot, "main_file_cache.idx0"));
    assert.equal(isCacheInstallationValid(validationRoot), false);

    assert.deepEqual(
        parseOpenRs2XteaKeys([{ group: 42, key: [1, 2, 3, 4] }], 1),
        { 42: [1, 2, 3, 4] },
    );
    assert.throws(() => parseOpenRs2XteaKeys([], 1));
    assert.throws(() => parseOpenRs2XteaKeys([{ group: 42, key: [1] }], 1));

    const mergeRoot = path.join(testDirectory, "manifest-merge");
    fs.mkdirSync(mergeRoot, { recursive: true });
    const mergeManifest = path.join(mergeRoot, "caches.json");
    const unrelatedEntry = {
        name: "osrs-236_2026-01-01",
        game: "oldschool",
        environment: "live",
        revision: 236,
        timestamp: "2026-01-01T00:00:00.000Z",
        size: 1,
    };
    const oldTargetEntry = {
        name: "osrs-237_2026-02-01",
        game: "oldschool",
        environment: "live",
        revision: 237,
        timestamp: "2026-02-01T00:00:00.000Z",
        size: 2,
    };
    const replacementTargetEntry = { ...oldTargetEntry, size: 3 };
    fs.writeFileSync(
        mergeManifest,
        JSON.stringify([unrelatedEntry, oldTargetEntry]),
        "utf8",
    );
    writeMergedCacheManifest(mergeManifest, replacementTargetEntry);
    assert.deepEqual(JSON.parse(fs.readFileSync(mergeManifest, "utf8")), [
        replacementTargetEntry,
        unrelatedEntry,
    ]);

    fs.writeFileSync(mergeManifest, "not-json", "utf8");
    assert.throws(() => writeMergedCacheManifest(mergeManifest, replacementTargetEntry));
    assert.equal(fs.readFileSync(mergeManifest, "utf8"), "not-json");

    const successRoot = path.join(testDirectory, "success");
    const successTarget = path.join(successRoot, "osrs-1_2026-01-01");
    const successStaging = path.join(successRoot, ".osrs-1.download-token");
    const successBackup = path.join(successRoot, ".osrs-1.backup-token");
    const successManifest = path.join(successRoot, "caches.json");
    const unrelatedCache = path.join(successRoot, "osrs-2_2026-02-02");
    makeCache(successTarget, "old-target");
    makeCache(successStaging, "new-target");
    makeCache(unrelatedCache, "unrelated");
    fs.writeFileSync(successManifest, "old-manifest", "utf8");

    publishStagedCache({
        targetCacheDir: successTarget,
        stagingCacheDir: successStaging,
        backupCacheDir: successBackup,
        manifestPath: successManifest,
        publishManifest: () => fs.writeFileSync(successManifest, "new-manifest", "utf8"),
        assertOwnership: () => undefined,
    });

    assert.equal(readMarker(successTarget), "new-target");
    assert.equal(fs.readFileSync(successManifest, "utf8"), "new-manifest");
    assert.equal(fs.existsSync(successStaging), false);
    assert.equal(fs.existsSync(successBackup), false);
    assert.equal(readMarker(unrelatedCache), "unrelated", "unrelated cache revisions must survive");

    const manifestFailureRoot = path.join(testDirectory, "manifest-failure");
    const manifestFailureTarget = path.join(manifestFailureRoot, "target");
    const manifestFailureStaging = path.join(manifestFailureRoot, ".staging");
    const manifestFailureBackup = path.join(manifestFailureRoot, ".backup");
    const manifestFailureManifest = path.join(manifestFailureRoot, "caches.json");
    makeCache(manifestFailureTarget, "old-target");
    makeCache(manifestFailureStaging, "new-target");
    fs.writeFileSync(manifestFailureManifest, "old-manifest", "utf8");

    assert.throws(
        () =>
            publishStagedCache({
                targetCacheDir: manifestFailureTarget,
                stagingCacheDir: manifestFailureStaging,
                backupCacheDir: manifestFailureBackup,
                manifestPath: manifestFailureManifest,
                publishManifest: () => {
                    fs.writeFileSync(manifestFailureManifest, "partial-new-manifest", "utf8");
                    throw new Error("simulated manifest failure");
                },
                assertOwnership: () => undefined,
            }),
        /simulated manifest failure/,
    );
    assert.equal(readMarker(manifestFailureTarget), "old-target");
    assert.equal(readMarker(manifestFailureStaging), "new-target");
    assert.equal(fs.existsSync(manifestFailureBackup), false);
    assert.equal(fs.readFileSync(manifestFailureManifest, "utf8"), "old-manifest");

    const ownershipFailureRoot = path.join(testDirectory, "ownership-failure");
    const ownershipFailureTarget = path.join(ownershipFailureRoot, "target");
    const ownershipFailureStaging = path.join(ownershipFailureRoot, ".staging");
    const ownershipFailureBackup = path.join(ownershipFailureRoot, ".backup");
    const ownershipFailureManifest = path.join(ownershipFailureRoot, "caches.json");
    makeCache(ownershipFailureTarget, "old-target");
    makeCache(ownershipFailureStaging, "new-target");
    fs.writeFileSync(ownershipFailureManifest, "old-manifest", "utf8");
    let ownershipChecks = 0;

    assert.throws(
        () =>
            publishStagedCache({
                targetCacheDir: ownershipFailureTarget,
                stagingCacheDir: ownershipFailureStaging,
                backupCacheDir: ownershipFailureBackup,
                manifestPath: ownershipFailureManifest,
                publishManifest: () => fs.writeFileSync(ownershipFailureManifest, "new", "utf8"),
                assertOwnership: () => {
                    ownershipChecks += 1;
                    if (ownershipChecks === 3) throw new Error("simulated ownership loss");
                },
            }),
        /simulated ownership loss/,
    );
    assert.equal(readMarker(ownershipFailureTarget), "old-target");
    assert.equal(readMarker(ownershipFailureStaging), "new-target");
    assert.equal(fs.existsSync(ownershipFailureBackup), false);
    assert.equal(fs.readFileSync(ownershipFailureManifest, "utf8"), "old-manifest");

    const absentTargetRoot = path.join(testDirectory, "absent-target");
    const absentTarget = path.join(absentTargetRoot, "target");
    const absentTargetStaging = path.join(absentTargetRoot, ".staging");
    const absentTargetBackup = path.join(absentTargetRoot, ".backup");
    const absentTargetManifest = path.join(absentTargetRoot, "caches.json");
    makeCache(absentTargetStaging, "new-target");

    assert.throws(
        () =>
            publishStagedCache({
                targetCacheDir: absentTarget,
                stagingCacheDir: absentTargetStaging,
                backupCacheDir: absentTargetBackup,
                manifestPath: absentTargetManifest,
                publishManifest: () => {
                    fs.writeFileSync(absentTargetManifest, "partial-new-manifest", "utf8");
                    throw new Error("simulated first-install failure");
                },
                assertOwnership: () => undefined,
            }),
        /simulated first-install failure/,
    );
    assert.equal(fs.existsSync(absentTarget), false);
    assert.equal(readMarker(absentTargetStaging), "new-target");
    assert.equal(fs.existsSync(absentTargetBackup), false);
    assert.equal(fs.existsSync(absentTargetManifest), false);
} finally {
    fs.rmSync(testDirectory, { recursive: true, force: true });
}

console.log("ensure-cache publish regression test passed");
