import {
    CacheLike,
    openCache,
    readCacheResponseBytes,
} from "@august/osrs-engine/cache/CacheFiles";
import { MAX_CACHE_FILE_BYTES } from "@august/osrs-engine/cache/CacheLimits";
import { Sector } from "@august/osrs-engine/cache/store/Sector";
import { PresenceBitset } from "@august/osrs-engine/cache/js5/PresenceBitset";

const RANGE_SEGMENT = "/range/";
const MANIFEST_SEGMENT = "/range/manifest";
const RANGE_START_HEADER = "Range-Start";
const RANGE_KEY_HEADER = "Range-Key";
const FLUSH_DELAY_MS = 1500;
const MAX_MANIFEST_BYTES = 16 * 1024;
const MAX_MANIFEST_VERSION_LENGTH = 256;
const MAX_PERSISTED_RANGES = 65_536;

type SectorRun = { start: number; end: number };

export type PersistedRangeData = {
    byteOffset: number;
    bytes: Uint8Array;
};

export type ByteRange = {
    startByte: number;
    endByte: number;
};

type PersistedRange = ByteRange & {
    key: string;
};

/**
 * Persists on-demand fetched dat2 ranges to the existing CacheStorage/IDB
 * layer so they are never re-downloaded. Entries mirror the resumable
 * downloader's part scheme: one entry per contiguous sector run, keyed
 * `{dat2Path}/range/?s={startSector}&n={count}` with the byte offset in a
 * `Range-Start` header (response URLs are not reliably preserved).
 */
export class Js5Persistence {
    private readonly cachePromise: Promise<CacheLike>;
    private readonly persistedSectors: Uint8Array;
    private pendingRuns: SectorRun[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | undefined;
    private flushChain: Promise<void> = Promise.resolve();
    /**
     * CacheStorage can enumerate the saved entries without reading their
     * bodies. Keep that metadata in memory so a deferred group can be restored
     * on demand instead of rebuilding every explored asset during startup.
     */
    private persistedRangeIndex: Promise<PersistedRange[]> | undefined;

    static async readManifest(
        cacheName: string,
        dat2Path: string,
    ): Promise<{ total: number; version: string } | undefined> {
        try {
            const cache = await openCache(cacheName);
            const resp = await cache.match(dat2Path + MANIFEST_SEGMENT);
            if (!resp) {
                return undefined;
            }
            const manifest = JSON.parse(
                new TextDecoder().decode(await readCacheResponseBytes(resp, MAX_MANIFEST_BYTES)),
            ) as { total?: number; version?: string };
            if (
                typeof manifest.total === "number" &&
                Number.isSafeInteger(manifest.total) &&
                manifest.total > 0 &&
                manifest.total <= MAX_CACHE_FILE_BYTES &&
                (manifest.version === undefined ||
                    (typeof manifest.version === "string" &&
                        manifest.version.length <= MAX_MANIFEST_VERSION_LENGTH))
            ) {
                return { total: manifest.total, version: manifest.version ?? "" };
            }
        } catch {}
        return undefined;
    }

    /** Whether a prior session persisted the complete dat2 file. */
    static async hasFullDat2(cacheName: string, dat2Path: string): Promise<boolean> {
        try {
            const cache = await openCache(cacheName);
            return !!(await cache.match(dat2Path));
        } catch {
            return false;
        }
    }

    constructor(
        private readonly cacheName: string,
        private readonly dat2Path: string,
        private readonly buffer: ArrayBuffer,
    ) {
        this.cachePromise = openCache(cacheName);
        const sectorCount = Math.ceil(buffer.byteLength / Sector.SIZE);
        this.persistedSectors = new Uint8Array((sectorCount + 7) >> 3);
    }

    async writeManifest(version: string): Promise<void> {
        const cache = await this.cachePromise;
        await cache.put(
            this.dat2Path + MANIFEST_SEGMENT,
            new Response(JSON.stringify({ total: this.buffer.byteLength, version }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
    }

    /** Drop every persisted range (the server's dat2 changed identity). */
    async clearAllRanges(): Promise<void> {
        if (this.flushTimer !== undefined) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
        this.pendingRuns = [];
        try {
            // Let an already-running write finish before deleting its output.
            // Keep cleanup best-effort if storage initialization or an earlier
            // write failed; the in-memory presence state still must be reset.
            await this.flushChain;
            const cache = await this.cachePromise;
            if (cache.matchAll) {
                const responses = await cache.matchAll(this.dat2Path + RANGE_SEGMENT, {
                    ignoreSearch: true,
                });
                for (const resp of responses) {
                    const key = resp.headers.get(RANGE_KEY_HEADER);
                    if (key) {
                        await cache.delete(key);
                    }
                }
            }
        } catch (e) {
            console.warn("[js5] Failed clearing persisted ranges:", e);
        } finally {
            this.persistedRangeIndex = undefined;
            this.persistedSectors.fill(0);
        }
    }

    /**
     * Load only persisted entries which overlap the supplied byte ranges.
     *
     * Starting a session used to read every cached animation, model and map
     * range here. That made startup time grow with playtime. Eager cache data
     * is restored now; deferred ranges stay in CacheStorage until a loader
     * asks for one through readPersistedRangeContaining().
     */
    async restoreIntersecting(
        ranges: readonly ByteRange[],
        apply: (byteOffset: number, bytes: Uint8Array) => void,
    ): Promise<number> {
        if (ranges.length === 0) {
            return 0;
        }
        let restored = 0;
        try {
            const cache = await this.cachePromise;
            const persisted = await this.getPersistedRanges();
            for (const range of persisted) {
                if (!ranges.some((wanted) => range.startByte < wanted.endByte && wanted.startByte < range.endByte)) {
                    continue;
                }
                const response = await cache.match(range.key);
                if (!response) {
                    continue;
                }
                let bytes: Uint8Array;
                try {
                    const expectedLength = range.endByte - range.startByte;
                    bytes = await readCacheResponseBytes(response, expectedLength);
                    if (bytes.byteLength !== expectedLength) continue;
                } catch {
                    // Ignore a corrupt persisted entry and continue restoring
                    // independent ranges from the same cache.
                    continue;
                }
                apply(range.startByte, bytes);
                restored += bytes.byteLength;
            }
        } catch (e) {
            console.warn("[js5] Failed restoring startup ranges:", e);
        }
        return restored;
    }

    /**
     * Return a cached range that completely covers a requested cache span.
     * The caller applies it to its own sparse buffer, allowing workers and the
     * main thread to use the same persisted data without a full startup scan.
     */
    async readPersistedRangeContaining(
        startByte: number,
        endByte: number,
    ): Promise<PersistedRangeData | undefined> {
        const range = (await this.getPersistedRanges()).find(
            (candidate) => candidate.startByte <= startByte && candidate.endByte >= endByte,
        );
        if (!range) {
            return undefined;
        }
        const cache = await this.cachePromise;
        const response = await cache.match(range.key);
        if (!response) {
            return undefined;
        }
        let bytes: Uint8Array;
        try {
            const expectedLength = range.endByte - range.startByte;
            bytes = await readCacheResponseBytes(response, expectedLength);
            if (bytes.byteLength !== expectedLength) return undefined;
        } catch {
            return undefined;
        }
        if (bytes.byteLength < endByte - range.startByte) return undefined;
        return { byteOffset: range.startByte, bytes };
    }

    /** Backwards-compatible full restore for callers that genuinely need it. */
    async restore(apply: (byteOffset: number, bytes: Uint8Array) => void): Promise<number> {
        return this.restoreIntersecting(
            [{ startByte: 0, endByte: this.buffer.byteLength }],
            apply,
        );
    }

    /** Queue a fetched byte range for persistence (write-behind, coalesced). */
    queue(byteOffset: number, byteLength: number): void {
        if (
            !Number.isSafeInteger(byteOffset) ||
            !Number.isSafeInteger(byteLength) ||
            byteOffset < 0 ||
            byteLength <= 0 ||
            byteOffset >= this.buffer.byteLength
        ) {
            return;
        }
        const start = Math.floor(byteOffset / Sector.SIZE);
        const endByte = Math.min(byteOffset + byteLength, this.buffer.byteLength);
        const end =
            endByte >= this.buffer.byteLength
                ? Math.ceil(endByte / Sector.SIZE)
                : Math.floor(endByte / Sector.SIZE);
        if (end <= start || this.isRunPersisted(start, end)) {
            return;
        }
        this.pendingRuns.push({ start, end });
        this.scheduleFlush();
    }

    /**
     * Queue every present-but-unpersisted sector. In crossOriginIsolated
     * contexts worker fetches land in the shared buffer without notifying the
     * main thread; a periodic sweep picks those up for persistence.
     */
    sweep(presence: PresenceBitset): void {
        const sectorCount = Math.ceil(this.buffer.byteLength / Sector.SIZE);
        const presentBits = presence.bits;
        const byteCount = Math.min(presentBits.length, this.persistedSectors.length);
        let runStart = -1;
        let queued = false;
        for (let i = 0; i < byteCount; i++) {
            // Byte-wise fast path: skip the (usual) case of nothing new.
            const diff = presentBits[i] & ~this.persistedSectors[i];
            if (diff === 0) {
                if (runStart >= 0) {
                    this.pendingRuns.push({ start: runStart, end: i * 8 });
                    runStart = -1;
                    queued = true;
                }
                continue;
            }
            for (let b = 0; b < 8; b++) {
                const s = i * 8 + b;
                if (s >= sectorCount) {
                    break;
                }
                if ((diff >> b) & 1) {
                    if (runStart < 0) {
                        runStart = s;
                    }
                } else if (runStart >= 0) {
                    this.pendingRuns.push({ start: runStart, end: s });
                    runStart = -1;
                    queued = true;
                }
            }
        }
        if (runStart >= 0) {
            this.pendingRuns.push({ start: runStart, end: sectorCount });
            queued = true;
        }
        if (queued) {
            this.scheduleFlush();
        }
    }

    private scheduleFlush(): void {
        if (this.flushTimer === undefined) {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = undefined;
                this.flush();
            }, FLUSH_DELAY_MS);
        }
    }

    flush(): Promise<void> {
        const runs = this.mergePendingRuns();
        this.pendingRuns = [];
        if (runs.length === 0) {
            return this.flushChain;
        }
        this.flushChain = this.flushChain
            // A transient storage failure must not permanently poison the
            // write-behind chain and prevent every later range from flushing.
            .catch(() => {})
            .then(async () => {
                try {
                    const cache = await this.cachePromise;
                    for (const run of runs) {
                        try {
                            await this.persistRun(cache, run);
                        } catch (e) {
                            console.warn("[js5] Failed persisting range:", e);
                        }
                    }
                } catch (e) {
                    console.warn("[js5] Failed opening range persistence:", e);
                }
            });
        return this.flushChain;
    }

    private async persistRun(cache: CacheLike, run: SectorRun): Promise<void> {
        // Trim sectors persisted by an earlier flush or session.
        let { start, end } = run;
        while (start < end && this.isSectorPersisted(start)) {
            start++;
        }
        while (end > start && this.isSectorPersisted(end - 1)) {
            end--;
        }
        if (end <= start) {
            return;
        }
        const startByte = start * Sector.SIZE;
        const endByte = Math.min(end * Sector.SIZE, this.buffer.byteLength);
        const copy = new ArrayBuffer(endByte - startByte);
        new Uint8Array(copy).set(new Uint8Array(this.buffer, startByte, endByte - startByte));

        const url = `${this.dat2Path}${RANGE_SEGMENT}?s=${start}&n=${end - start}`;
        const resp = new Response(copy, {
            status: 200,
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Length": copy.byteLength.toString(),
                [RANGE_START_HEADER]: startByte.toString(),
                [RANGE_KEY_HEADER]: url,
            },
        });
        try {
            Object.defineProperty(resp, "url", { value: url });
        } catch {}
        await cache.put(url, resp);
        this.markPersisted(startByte, endByte - startByte);
        // Refresh lazily: the next lookup sees this entry without making each
        // individual write wait for another CacheStorage enumeration.
        this.persistedRangeIndex = undefined;
    }

    private async getPersistedRanges(): Promise<PersistedRange[]> {
        if (!this.persistedRangeIndex) {
            this.persistedRangeIndex = this.readPersistedRangeIndex();
        }
        return this.persistedRangeIndex;
    }

    private async readPersistedRangeIndex(): Promise<PersistedRange[]> {
        const cache = await this.cachePromise;
        if (!cache.matchAll) {
            return [];
        }
        try {
            const responses = await cache.matchAll(this.dat2Path + RANGE_SEGMENT, {
                ignoreSearch: true,
            });
            const ranges: PersistedRange[] = [];
            for (const response of responses) {
                if (ranges.length >= MAX_PERSISTED_RANGES) break;
                const key = response.headers.get(RANGE_KEY_HEADER);
                const startByte = Number(response.headers.get(RANGE_START_HEADER));
                const byteLength = Number(response.headers.get("Content-Length"));
                if (
                    !key ||
                    !key.startsWith(`${this.dat2Path}${RANGE_SEGMENT}?`) ||
                    !Number.isInteger(startByte) ||
                    startByte < 0 ||
                    startByte >= this.buffer.byteLength ||
                    !Number.isSafeInteger(byteLength) ||
                    byteLength <= 0 ||
                    byteLength > this.buffer.byteLength - startByte
                ) {
                    continue;
                }
                const endByte = startByte + byteLength;
                if (endByte <= startByte) {
                    continue;
                }
                this.markPersisted(startByte, endByte - startByte);
                ranges.push({ key, startByte, endByte });
            }
            return ranges;
        } catch (e) {
            console.warn("[js5] Failed indexing persisted ranges:", e);
            return [];
        }
    }

    private mergePendingRuns(): SectorRun[] {
        if (this.pendingRuns.length === 0) {
            return [];
        }
        const sorted = [...this.pendingRuns].sort((a, b) => a.start - b.start);
        const merged: SectorRun[] = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            const last = merged[merged.length - 1];
            if (sorted[i].start <= last.end) {
                last.end = Math.max(last.end, sorted[i].end);
            } else {
                merged.push({ ...sorted[i] });
            }
        }
        return merged;
    }

    private markPersisted(byteOffset: number, byteLength: number): void {
        const start = Math.floor(byteOffset / Sector.SIZE);
        const endByte = Math.min(byteOffset + byteLength, this.buffer.byteLength);
        const end =
            endByte >= this.buffer.byteLength
                ? Math.ceil(endByte / Sector.SIZE)
                : Math.floor(endByte / Sector.SIZE);
        for (let s = start; s < end; s++) {
            this.persistedSectors[s >> 3] |= 1 << (s & 7);
        }
    }

    private isSectorPersisted(sector: number): boolean {
        return (this.persistedSectors[sector >> 3] & (1 << (sector & 7))) !== 0;
    }

    private isRunPersisted(start: number, end: number): boolean {
        for (let s = start; s < end; s++) {
            if (!this.isSectorPersisted(s)) {
                return false;
            }
        }
        return true;
    }
}
