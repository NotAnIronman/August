import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

import {
    assertCacheLockOwned,
    type CacheLockOptions,
    type CacheLockOwnership,
    heartbeatCacheLock,
    reclaimStaleCacheLock,
    releaseCacheLock,
    startCacheLockHeartbeat,
    tryAcquireCacheLock,
} from "./ensure-cache-lock";
import { publishStagedCache, writeMergedCacheManifest } from "./ensure-cache-publish";
import {
    isCacheInstallationValid,
    parseOpenRs2XteaKeys,
} from "./ensure-cache-validation";
import { serverAppPath, serverVarPath } from "@tools/lib/repository-paths";

const OPENRS2_API = "https://archive.openrs2.org";
const CACHES_DIR = serverVarPath("cache", "osrs");
const TARGET_FILE = serverAppPath("target.txt");
const LOCK_FILE = path.join(CACHES_DIR, ".cache-download.lock");
const CACHES_MANIFEST_FILE = path.join(CACHES_DIR, "caches.json");
const LOCK_POLL_MS = 1000;
const LOCK_STALE_MS = 10 * 60 * 1000;

type OpenRS2CacheEntry = {
    id: number;
    scope: string;
    game: string;
    environment: string;
    language: string;
    builds: Array<{ major: number; minor: number | null }>;
    timestamp: string;
    sources: string[];
    valid_indexes: number;
    indexes: number;
    valid_groups: number;
    groups: number;
    valid_keys: number;
    keys: number;
    size: number;
};

const CACHE_LOCK_OPTIONS: CacheLockOptions = {
    lockPath: LOCK_FILE,
    staleMs: LOCK_STALE_MS,
};

async function waitForLock(): Promise<void> {
    while (fs.existsSync(LOCK_FILE)) {
        if (reclaimStaleCacheLock(CACHE_LOCK_OPTIONS)) {
            console.log("[CacheDownloader] Reclaimed stale cache download lock");
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    }
}

function readTarget(): string {
    const targetPath = TARGET_FILE;
    if (!fs.existsSync(targetPath)) {
        throw new Error(`target.txt not found at ${targetPath}`);
    }
    return fs.readFileSync(targetPath, "utf8").trim();
}

function parseTargetName(target: string): { revision: number; date: string } {
    const match = target.match(/^osrs-(\d+)_(\d{4}-\d{2}-\d{2})$/);
    if (!match) {
        throw new Error(`Invalid target format: "${target}" (expected osrs-{revision}_{date})`);
    }
    return { revision: parseInt(match[1], 10), date: match[2] };
}

function isCacheValid(cacheDir: string): boolean {
    return isCacheInstallationValid(cacheDir);
}

function cacheMatchesRevision(cacheDir: string, expectedRevision: number): boolean {
    try {
        const entry = JSON.parse(
            fs.readFileSync(path.join(cacheDir, "info.json"), "utf8"),
        ) as OpenRS2CacheEntry;
        return entry.builds?.some((build) => build.major === expectedRevision) === true;
    } catch {
        return false;
    }
}

function renderProgressBar(current: number, total: number, width = 40): string {
    const ratio = Math.min(current / total, 1);
    const filled = Math.round(width * ratio);
    const empty = width - filled;
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
    const pct = (ratio * 100).toFixed(1).padStart(5);
    const currentMB = (current / (1024 * 1024)).toFixed(1);
    const totalMB = (total / (1024 * 1024)).toFixed(1);
    return `  [${bar}] ${pct}% (${currentMB}/${totalMB} MB)`;
}

async function findCacheOnOpenRS2(
    revision: number,
    date: string,
): Promise<OpenRS2CacheEntry | undefined> {
    console.log("[CacheDownloader] Fetching cache index from OpenRS2...");
    const resp = await fetch(`${OPENRS2_API}/caches.json`);
    if (!resp.ok) {
        throw new Error(`Failed to fetch OpenRS2 cache index: ${resp.status} ${resp.statusText}`);
    }
    const caches: OpenRS2CacheEntry[] = await resp.json();

    const match = caches.find(
        (c) =>
            c.scope === "runescape" &&
            c.game === "oldschool" &&
            c.language === "en" &&
            c.builds.length > 0 &&
            c.builds[0].major === revision &&
            c.timestamp?.startsWith(date),
    );

    if (match) return match;

    const revisionMatches = caches
        .filter(
            (c) =>
                c.scope === "runescape" &&
                c.game === "oldschool" &&
                c.language === "en" &&
                c.builds.length > 0 &&
                c.builds[0].major === revision &&
                c.timestamp,
        )
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    return revisionMatches[0];
}

async function downloadWithProgress(url: string, label: string): Promise<Buffer> {
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`Download failed: ${resp.status} ${resp.statusText} (${url})`);
    }

    const contentLength = parseInt(resp.headers.get("content-length") ?? "0", 10);
    if (!resp.body || contentLength === 0) {
        const arrayBuf = await resp.arrayBuffer();
        return Buffer.from(arrayBuf);
    }

    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    process.stdout.write(`  ${label}\n`);

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        process.stdout.write(`\r${renderProgressBar(received, contentLength)}`);
    }
    process.stdout.write("\n");

    return Buffer.concat(chunks);
}

function refreshOwnedLock(ownership: CacheLockOwnership): void {
    if (!heartbeatCacheLock(ownership)) assertCacheLockOwned(ownership);
}

async function downloadCache(
    entry: OpenRS2CacheEntry,
    cacheDir: string,
    ownership: CacheLockOwnership,
): Promise<void> {
    fs.mkdirSync(cacheDir, { recursive: true });

    refreshOwnedLock(ownership);
    console.log(`[CacheDownloader] Downloading cache files (id=${entry.id})...`);
    const zipBuffer = await downloadWithProgress(
        `${OPENRS2_API}/caches/${entry.scope}/${entry.id}/disk.zip`,
        "Downloading cache archive...",
    );

    refreshOwnedLock(ownership);
    console.log("[CacheDownloader] Extracting cache files...");
    const zip = new AdmZip(zipBuffer);
    zip.extractEntryTo("cache/", cacheDir, false, true);

    refreshOwnedLock(ownership);
    console.log("[CacheDownloader] Downloading XTEA keys...");
    const keysResp = await fetch(`${OPENRS2_API}/caches/${entry.scope}/${entry.id}/keys.json`);
    if (!keysResp.ok) {
        throw new Error(
            `XTEA key download failed: ${keysResp.status} ${keysResp.statusText}`,
        );
    }
    const xteas = parseOpenRs2XteaKeys(await keysResp.json(), entry.valid_keys);

    fs.writeFileSync(path.join(cacheDir, "keys.json"), JSON.stringify(xteas), "utf8");
    fs.writeFileSync(path.join(cacheDir, "info.json"), JSON.stringify(entry), "utf8");
    refreshOwnedLock(ownership);
}

function writeCachesJson(target: string, entry: OpenRS2CacheEntry): void {
    const cacheEntry = {
        name: target,
        game: entry.game,
        environment: entry.environment,
        revision: entry.builds[0].major,
        timestamp: entry.timestamp,
        size: entry.size ?? 0,
    };

    writeMergedCacheManifest(CACHES_MANIFEST_FILE, cacheEntry);
}

/**
 * `caches.json` is the cache-loader's source of truth.  A cache directory can
 * be copied in or survive a target change while that manifest still points to
 * an older revision, which made data-export scripts silently inspect the
 * wrong cache.  The validated target's own info.json is sufficient to repair
 * the manifest without another download.
 */
function refreshCacheManifestFromDisk(target: string, cacheDir: string): boolean {
    const infoPath = path.join(cacheDir, "info.json");
    try {
        const entry = JSON.parse(fs.readFileSync(infoPath, "utf8")) as OpenRS2CacheEntry;
        if (!Array.isArray(entry.builds) || entry.builds.length === 0) {
            throw new Error("missing cache build metadata");
        }
        writeCachesJson(target, entry);
        console.log(`[CacheDownloader] Cache manifest set to "${target}"`);
        return true;
    } catch (error) {
        // A cache can be replaced by another startup process after the caller
        // validates it but before this manifest refresh reads info.json. Treat
        // that short-lived or interrupted state as invalid so ensureCache can
        // safely acquire the download lock and publish a fully validated
        // replacement; never leave the whole server unable to start.
        console.warn(
            `[CacheDownloader] Cache metadata is unreadable at ${infoPath}; refreshing the cache: ${String(error)}`,
        );
        return false;
    }
}

async function ensureCache(): Promise<void> {
    const target = readTarget();
    const { revision, date } = parseTargetName(target);
    const cacheDir = path.resolve(CACHES_DIR, target);

    console.log(`[CacheDownloader] Target cache: "${target}" (rev ${revision})`);

    if (isCacheValid(cacheDir) && cacheMatchesRevision(cacheDir, revision)) {
        // Keep subsequent cache consumers (item sync, NPC tools, world boot)
        // locked to target.txt even when this directory already existed.
        if (refreshCacheManifestFromDisk(target, cacheDir)) {
            console.log("[CacheDownloader] Cache is present and valid");
            return;
        }
    }

    if (isCacheValid(cacheDir)) {
        console.log("[CacheDownloader] Cache metadata does not match target revision; refreshing it");
    }

    let ownership = tryAcquireCacheLock(CACHE_LOCK_OPTIONS);
    if (!ownership) {
        console.log("[CacheDownloader] Another process is downloading the cache, waiting...");
    }

    while (!ownership) {
        await waitForLock();
        if (isCacheValid(cacheDir) && cacheMatchesRevision(cacheDir, revision)) {
            if (refreshCacheManifestFromDisk(target, cacheDir)) {
                console.log("[CacheDownloader] Cache is now available (downloaded by another process)");
                return;
            }
        }
        ownership = tryAcquireCacheLock(CACHE_LOCK_OPTIONS);
    }

    startCacheLockHeartbeat(ownership);
    const stagingCacheDir = path.resolve(CACHES_DIR, `.${target}.download-${ownership.token}`);
    const backupCacheDir = path.resolve(CACHES_DIR, `.${target}.backup-${ownership.token}`);

    try {
        console.log("[CacheDownloader] Cache missing or incomplete, searching OpenRS2...");

        const entry = await findCacheOnOpenRS2(revision, date);
        if (!entry) {
            throw new Error(
                `Could not find cache for revision ${revision} (date=${date}) on OpenRS2 archive`,
            );
        }

        console.log(
            `[CacheDownloader] Found cache id=${entry.id} (rev ${entry.builds[0].major}, ${entry.timestamp})`,
        );

        fs.mkdirSync(CACHES_DIR, { recursive: true });
        await downloadCache(entry, stagingCacheDir, ownership);

        if (
            !isCacheValid(stagingCacheDir) ||
            !cacheMatchesRevision(stagingCacheDir, revision)
        ) {
            throw new Error("Cache download completed but validation failed");
        }

        // Do not touch the current cache until its replacement has downloaded
        // and validated in a token-owned staging directory.
        refreshOwnedLock(ownership);
        console.log("[CacheDownloader] Installing validated cache...");
        publishStagedCache({
            targetCacheDir: cacheDir,
            stagingCacheDir,
            backupCacheDir,
            manifestPath: CACHES_MANIFEST_FILE,
            publishManifest: () => writeCachesJson(target, entry),
            assertOwnership: () => refreshOwnedLock(ownership),
        });

        console.log("[CacheDownloader] Cache downloaded and validated successfully");
    } finally {
        if (fs.existsSync(stagingCacheDir)) {
            try {
                fs.rmSync(stagingCacheDir, { recursive: true, force: true });
            } catch (error) {
                console.warn(
                    `[CacheDownloader] Could not remove staging directory ${stagingCacheDir}: ${String(error)}`,
                );
            }
        }
        if (!releaseCacheLock(ownership)) {
            console.warn("[CacheDownloader] Cache lock was no longer owned during cleanup");
        }
    }
}

ensureCache()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("[CacheDownloader] Fatal:", err);
        process.exit(1);
    });
