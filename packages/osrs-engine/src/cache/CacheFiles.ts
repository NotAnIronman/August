/// <reference lib="DOM" />
import { CacheType } from "@august/osrs-engine/cache/CacheType";
import {
    MAX_CACHE_FILE_BYTES,
    MAX_CACHE_INDEX_COUNT,
    addByteLengthsWithinLimit,
    assertByteLengthWithinLimit,
} from "@august/osrs-engine/cache/CacheLimits";
import { SectorCluster } from "@august/osrs-engine/cache/store/SectorCluster";
import { parseContentRange } from "@august/osrs-engine/cache/js5/HttpRange";
import { mapWithConcurrency } from "@august/osrs-engine/util/AsyncConcurrency";
import { UnsupportedOperationError } from "@august/osrs-engine/util/UnsupportedOperationError";

const MAX_LEGACY_MAP_CATALOG_BYTES = 4 * 1024 * 1024;
export const MAX_LEGACY_MAP_NAMES = 32_768;
export const MAX_CACHE_INDEX_FILE_BYTES = 64 * 1024 * 1024;
const LEGACY_MAP_FETCH_CONCURRENCY = 16;
const CACHE_INDEX_FETCH_CONCURRENCY = 8;
const MAX_CACHE_PART_MANIFEST_BYTES = 16 * 1024;
const MAX_CACHE_PARTS = MAX_CACHE_INDEX_COUNT * 16;
const LEGACY_MAP_FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/;

/** Validate legacy map file names before they become request URLs and cache keys. */
export function parseLegacyMapNames(value: unknown): string[] {
    if (!Array.isArray(value)) {
        throw new TypeError("Legacy cache map catalog must be an array");
    }
    if (value.length > MAX_LEGACY_MAP_NAMES) {
        throw new TypeError(
            `Legacy cache map catalog cannot contain more than ${MAX_LEGACY_MAP_NAMES} entries`,
        );
    }
    const names = new Set<string>();
    for (const valueName of value) {
        if (
            typeof valueName !== "string" ||
            valueName === "." ||
            valueName === ".." ||
            !LEGACY_MAP_FILE_NAME.test(valueName)
        ) {
            throw new TypeError("Legacy cache map catalog contains an invalid file name");
        }
        names.add(valueName);
    }
    return [...names];
}

// Minimal cache wrapper interface to tolerate environments without CacheStorage (e.g., some iOS contexts)
export type CacheLike = {
    match(request: RequestInfo, options?: CacheQueryOptions): Promise<Response | undefined>;
    matchAll?(request: RequestInfo, options?: CacheQueryOptions): Promise<Response[]>;
    put(request: RequestInfo, response: Response): Promise<void>;
    delete(request: RequestInfo, options?: CacheQueryOptions): Promise<boolean>;
};

const CACHE_STORAGE_PREFIX = "osrs-typescript::cache::";

const IDB_CACHE_DB_NAME = "osrs-typescript::cache-fallback";
const IDB_CACHE_DB_VERSION = 1;
const IDB_CACHE_STORE = "entries";
const IDB_CACHE_NAME_INDEX = "byCacheName";

type StoredResponseRecord = {
    key: string;
    cacheName: string;
    requestUrl: string;
    body: ArrayBuffer;
    headers: [string, string][];
    status: number;
    statusText: string;
};

let idbDatabasePromise: Promise<IDBDatabase> | undefined;
let idbInitializationFailureLogged = false;
const memoryCacheStores = new Map<string, Map<string, StoredResponseRecord>>();

function resolveCacheKey(cacheName: string): string {
    return `${CACHE_STORAGE_PREFIX}${cacheName}`;
}

export async function openCache(cacheName: string): Promise<CacheLike> {
    if (typeof (globalThis as any).caches !== "undefined") {
        return (await (globalThis as any).caches.open(resolveCacheKey(cacheName))) as CacheLike;
    }
    try {
        return await createIdbCache(cacheName);
    } catch (err) {
        if (!idbInitializationFailureLogged && typeof console !== "undefined" && console.warn) {
            console.warn(
                "[storage] IndexedDB unavailable; cached RuneScape data will be re-downloaded each session.",
                err,
            );
            idbInitializationFailureLogged = true;
        }
        return createMemoryCache(cacheName);
    }
}

function getIndexedDBFactory(): IDBFactory | undefined {
    const factory = (globalThis as any).indexedDB;
    return typeof factory === "undefined" ? undefined : (factory as IDBFactory);
}

function buildEntryKey(cacheName: string, requestUrl: string): string {
    return `${cacheName}::${requestUrl}`;
}

function normalizeRequestUrl(request: RequestInfo): string {
    if (typeof request === "string") {
        return request;
    }
    const maybeRequest = request as { url?: string };
    if (maybeRequest && typeof maybeRequest.url === "string") {
        return maybeRequest.url;
    }
    return String(request);
}

function stripSearch(url: string): string {
    const queryIndex = url.indexOf("?");
    return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
}

function responseFromRecord(record: StoredResponseRecord): Response {
    const headers = new Headers(record.headers);
    const body = record.body.slice(0);
    const response = new Response(body, {
        status: record.status,
        statusText: record.statusText,
        headers,
    });
    try {
        Object.defineProperty(response, "url", { value: record.requestUrl, configurable: true });
    } catch {}
    return response;
}

async function buildStoredRecord(
    cacheName: string,
    requestUrl: string,
    response: Response,
): Promise<StoredResponseRecord> {
    const headers: [string, string][] = [];
    response.headers.forEach((value, key) => {
        headers.push([key, value]);
    });
    const status = response.status;
    const statusText = response.statusText;
    const body = await response.arrayBuffer();
    return {
        key: buildEntryKey(cacheName, requestUrl),
        cacheName,
        requestUrl,
        body,
        headers,
        status,
        statusText,
    };
}

async function ensureIdbDatabase(): Promise<IDBDatabase> {
    if (!idbDatabasePromise) {
        const factory = getIndexedDBFactory();
        if (!factory) {
            throw new Error("IndexedDB not supported");
        }
        idbDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = factory.open(IDB_CACHE_DB_NAME, IDB_CACHE_DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                let store: IDBObjectStore;
                if (!db.objectStoreNames.contains(IDB_CACHE_STORE)) {
                    store = db.createObjectStore(IDB_CACHE_STORE, { keyPath: "key" });
                } else {
                    store = request.transaction!.objectStore(IDB_CACHE_STORE);
                }
                if (!store.indexNames.contains(IDB_CACHE_NAME_INDEX)) {
                    store.createIndex(IDB_CACHE_NAME_INDEX, "cacheName", { unique: false });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () =>
                reject(request.error ?? new Error("Failed to open IndexedDB cache fallback"));
        }).catch((err) => {
            idbDatabasePromise = undefined;
            throw err;
        });
    }
    return idbDatabasePromise;
}

function idbGetEntry(db: IDBDatabase, key: string): Promise<StoredResponseRecord | undefined> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_CACHE_STORE, "readonly");
        const store = tx.objectStore(IDB_CACHE_STORE);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result as StoredResponseRecord | undefined);
        request.onerror = () => reject(request.error);
    });
}

function idbPutEntry(db: IDBDatabase, entry: StoredResponseRecord): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_CACHE_STORE, "readwrite");
        const store = tx.objectStore(IDB_CACHE_STORE);
        const request = store.put(entry);
        let settled = false;
        const fail = (error: DOMException | null) => {
            if (settled) {
                return;
            }
            settled = true;
            reject(error ?? new DOMException("IndexedDB put failed"));
        };
        request.onerror = () => fail(request.error);
        tx.onerror = () => fail(tx.error);
        tx.onabort = () => fail(tx.error);
        tx.oncomplete = () => {
            if (!settled) {
                settled = true;
                resolve();
            }
        };
    });
}

function idbDeleteEntry(db: IDBDatabase, key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_CACHE_STORE, "readwrite");
        const store = tx.objectStore(IDB_CACHE_STORE);
        let existed = false;
        const fail = (error: DOMException | null) => {
            reject(error ?? new DOMException("IndexedDB delete failed"));
        };
        const getRequest = store.get(key);
        let deleteRequest: IDBRequest | undefined;
        getRequest.onsuccess = () => {
            existed = !!getRequest.result;
            if (existed) {
                deleteRequest = store.delete(key);
                deleteRequest.onerror = () => fail(deleteRequest!.error);
            }
        };
        getRequest.onerror = () => fail(getRequest.error);
        tx.onerror = () => fail(tx.error);
        tx.onabort = () => fail(tx.error);
        tx.oncomplete = () => resolve(existed);
    });
}

function idbGetEntriesByPrefix(
    db: IDBDatabase,
    cacheName: string,
    prefix: string,
    ignoreSearch: boolean,
): Promise<StoredResponseRecord[]> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_CACHE_STORE, "readonly");
        const store = tx.objectStore(IDB_CACHE_STORE);
        let index: IDBIndex;
        try {
            index = store.index(IDB_CACHE_NAME_INDEX);
        } catch (err) {
            reject(err as DOMException);
            return;
        }
        const normalizedPrefix = ignoreSearch ? stripSearch(prefix) : prefix;
        const results: StoredResponseRecord[] = [];
        const request = index.openCursor(IDBKeyRange.only(cacheName));
        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (!cursor) {
                resolve(results);
                return;
            }
            const value = cursor.value as StoredResponseRecord;
            const candidate = ignoreSearch ? stripSearch(value.requestUrl) : value.requestUrl;
            if (candidate.startsWith(normalizedPrefix)) {
                results.push(value);
            }
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

function createMemoryCache(cacheName: string): CacheLike {
    let store = memoryCacheStores.get(cacheName);
    if (!store) {
        store = new Map<string, StoredResponseRecord>();
        memoryCacheStores.set(cacheName, store);
    }
    return {
        async match(request: RequestInfo, options?: CacheQueryOptions) {
            const requestUrl = normalizeRequestUrl(request);
            if (options?.ignoreSearch) {
                const target = stripSearch(requestUrl);
                for (const entry of store.values()) {
                    if (stripSearch(entry.requestUrl) === target) {
                        return responseFromRecord(entry);
                    }
                }
                return undefined;
            }
            const entry = store.get(buildEntryKey(cacheName, requestUrl));
            return entry ? responseFromRecord(entry) : undefined;
        },
        async matchAll(request: RequestInfo, options?: CacheQueryOptions) {
            const requestUrl = normalizeRequestUrl(request);
            const ignore = options?.ignoreSearch === true;
            const prefix = ignore ? stripSearch(requestUrl) : requestUrl;
            const responses: Response[] = [];
            for (const entry of store.values()) {
                const candidate = ignore ? stripSearch(entry.requestUrl) : entry.requestUrl;
                if (candidate.startsWith(prefix)) {
                    responses.push(responseFromRecord(entry));
                }
            }
            return responses;
        },
        async put(request: RequestInfo, response: Response) {
            const requestUrl = normalizeRequestUrl(request);
            const entry = await buildStoredRecord(cacheName, requestUrl, response);
            store.set(entry.key, entry);
        },
        async delete(request: RequestInfo) {
            const requestUrl = normalizeRequestUrl(request);
            const key = buildEntryKey(cacheName, requestUrl);
            return store.delete(key);
        },
    };
}

async function createIdbCache(cacheName: string): Promise<CacheLike> {
    const db = await ensureIdbDatabase();
    let fallback: CacheLike | undefined;
    let failed = false;
    const ensureFallback = (error?: unknown): CacheLike => {
        if (!failed && typeof console !== "undefined" && console.warn) {
            console.warn(`[storage] Falling back to in-memory cache for ${cacheName}`, error);
        }
        failed = true;
        if (!fallback) {
            fallback = createMemoryCache(cacheName);
        }
        return fallback;
    };

    return {
        async match(request: RequestInfo, options?: CacheQueryOptions) {
            if (failed) {
                return fallback!.match(request, options);
            }
            try {
                const requestUrl = normalizeRequestUrl(request);
                if (options?.ignoreSearch) {
                    const target = stripSearch(requestUrl);
                    const entries = await idbGetEntriesByPrefix(db, cacheName, requestUrl, true);
                    for (const entry of entries) {
                        if (stripSearch(entry.requestUrl) === target) {
                            return responseFromRecord(entry);
                        }
                    }
                    return undefined;
                }
                const entry = await idbGetEntry(db, buildEntryKey(cacheName, requestUrl));
                return entry ? responseFromRecord(entry) : undefined;
            } catch (err) {
                return ensureFallback(err).match(request, options);
            }
        },
        async matchAll(request: RequestInfo, options?: CacheQueryOptions) {
            if (failed) {
                return fallback!.matchAll ? fallback!.matchAll(request, options) : [];
            }
            try {
                const requestUrl = normalizeRequestUrl(request);
                const entries = await idbGetEntriesByPrefix(
                    db,
                    cacheName,
                    requestUrl,
                    options?.ignoreSearch === true,
                );
                return entries.map((entry) => responseFromRecord(entry));
            } catch (err) {
                const fb = ensureFallback(err);
                return fb.matchAll ? fb.matchAll(request, options) : [];
            }
        },
        async put(request: RequestInfo, response: Response) {
            if (failed) {
                return fallback!.put(request, response);
            }
            const requestUrl = normalizeRequestUrl(request);
            const entry = await buildStoredRecord(cacheName, requestUrl, response);
            try {
                await idbPutEntry(db, entry);
            } catch (err) {
                const fb = ensureFallback(err);
                const fallbackResponse = responseFromRecord(entry);
                await fb.put(requestUrl, fallbackResponse);
            }
        },
        async delete(request: RequestInfo) {
            if (failed) {
                return fallback!.delete(request);
            }
            const requestUrl = normalizeRequestUrl(request);
            try {
                return await idbDeleteEntry(db, buildEntryKey(cacheName, requestUrl));
            } catch (err) {
                return ensureFallback(err).delete(request);
            }
        },
    };
}

export async function pruneCacheStorage(keepNames: string[]): Promise<void> {
    const keepMemoryNames = new Set(keepNames);
    for (const cacheName of memoryCacheStores.keys()) {
        if (!keepMemoryNames.has(cacheName)) {
            memoryCacheStores.delete(cacheName);
        }
    }
    if (typeof (globalThis as any).caches === "undefined") {
        return;
    }
    try {
        const keepKeys = new Set(keepNames.map(resolveCacheKey));
        const cacheNames: string[] = await (globalThis as any).caches.keys();
        const deletions: Promise<boolean>[] = [];
        for (const key of cacheNames) {
            if (!key.startsWith(CACHE_STORAGE_PREFIX)) {
                continue;
            }
            if (!keepKeys.has(key)) {
                deletions.push((globalThis as any).caches.delete(key));
            }
        }
        await Promise.allSettled(deletions);
    } catch {}
}

export { resolveCacheKey };

export class CacheFiles {
    static DAT_FILE_NAME = "main_file_cache.dat";
    static DAT2_FILE_NAME = "main_file_cache.dat2";

    static INDEX_FILE_PREFIX = "main_file_cache.idx";

    static META_FILE_NAME = "main_file_cache.idx255";

    static DAT_INDEX_COUNT = 5;

    static fetchFiles(
        cacheType: CacheType,
        baseUrl: string,
        name: string,
        shared: boolean = false,
        signal?: AbortSignal,
        progressListener?: ProgressListener,
    ): Promise<CacheFiles> {
        switch (cacheType) {
            case "classic":
                throw new UnsupportedOperationError(
                    'CacheFiles.fetchFiles does not support the "classic" cache format',
                );
            case "legacy":
                return CacheFiles.fetchLegacy(baseUrl, name, shared, signal, progressListener);
            case "dat":
                return CacheFiles.fetchDat(baseUrl, name, shared, signal, progressListener);
            case "dat2":
                return CacheFiles.fetchDat2(baseUrl, name, [], shared, signal, progressListener);
        }
    }

    static async fetchLegacy(
        baseUrl: string,
        cacheName: string,
        shared: boolean = false,
        signal?: AbortSignal,
        progressListener?: ProgressListener,
    ): Promise<CacheFiles> {
        const files = new Map<string, ArrayBuffer>();

        const cache = await openCache(cacheName);

        const modelsFilePromise = fetchCachedFile(
            baseUrl,
            "models",
            shared,
            false,
            cache,
            signal,
            progressListener,
        );

        const fileNames = ["title", "config", "media", "textures"];
        const filePromises = fileNames.map((name) =>
            fetchCachedFile(baseUrl, name, shared, false, cache, signal),
        );

        let mapNames: string[] = [];
        try {
            const mapsUrl = baseUrl + "maps.json";
            const response = await fetch(mapsUrl, { signal });
            if (!response.ok) {
                throw new Error(`Failed downloading ${mapsUrl}, ${response.status}`);
            }
            const parts = await toBufferParts(
                response,
                0,
                undefined,
                MAX_LEGACY_MAP_CATALOG_BYTES,
            );
            const parsed = JSON.parse(new TextDecoder().decode(partsToBuffer(parts, false))) as unknown;
            mapNames = parseLegacyMapNames(parsed);
        } catch (e) {
            if (signal?.aborted) throw e;
            console.warn(
                `CacheFiles.fetchLegacy: failed to load map names from ${baseUrl}maps.json`,
                e,
            );
        }

        const mapFilesPromise = mapWithConcurrency(
            mapNames,
            LEGACY_MAP_FETCH_CONCURRENCY,
            (mapName) =>
                fetchCachedFile(baseUrl, "maps/" + mapName, shared, false, cache, signal),
        );

        const [baseFiles, mapFiles] = await Promise.all([
            Promise.all([modelsFilePromise, ...filePromises]),
            mapFilesPromise,
        ]);
        const cachedFiles = [...baseFiles, ...mapFiles];

        for (const file of cachedFiles) {
            files.set(file.name, file.data);
        }

        return new CacheFiles(files);
    }

    static async fetchDat(
        baseUrl: string,
        cacheName: string,
        shared: boolean = false,
        signal?: AbortSignal,
        progressListener?: ProgressListener,
    ): Promise<CacheFiles> {
        const files = new Map<string, ArrayBuffer>();

        const cache = await openCache(cacheName);

        const dataFilePromise = fetchCachedFile(
            baseUrl,
            CacheFiles.DAT_FILE_NAME,
            shared,
            true,
            cache,
            signal,
            progressListener,
        );
        const indexFilePromises: Promise<CachedFile>[] = [];
        for (let i = 0; i < CacheFiles.DAT_INDEX_COUNT; i++) {
            // Prefer using SharedArrayBuffer when available to share across workers
            indexFilePromises.push(
                fetchCachedFile(
                    baseUrl,
                    CacheFiles.INDEX_FILE_PREFIX + i,
                    shared,
                    false,
                    cache,
                    signal,
                    undefined,
                    { maxBytes: MAX_CACHE_INDEX_FILE_BYTES },
                ),
            );
        }

        const dataAndIndices = await Promise.all([dataFilePromise, ...indexFilePromises]);
        for (const file of dataAndIndices) {
            files.set(file.name, file.data);
        }

        return new CacheFiles(files);
    }

    static async fetchDat2(
        baseUrl: string,
        cacheName: string,
        indicesToLoad: number[] = [],
        shared: boolean = false,
        signal?: AbortSignal,
        progressListener?: ProgressListener,
        /** Optional function to resolve index IDs to display names for sequential loading */
        indexNameResolver?: (indexId: number) => string,
        /** When true, skip only final dat2 blob persistence; incremental parts are still cached. */
        skipMainDataCacheWrite: boolean = false,
    ): Promise<CacheFiles> {
        const files = new Map<string, ArrayBuffer>();

        const cache = await openCache(cacheName);

        // If we have a name resolver, we load sequentially with phase labels
        const sequential = !!indexNameResolver;

        // Wrap progress listener to add label
        const createLabeledListener = (label: string): ProgressListener | undefined => {
            if (!progressListener) return undefined;
            return (progress) => {
                progressListener({ ...progress, label });
            };
        };

        // Validate the tiny index table before starting the large dat2 transfer.
        const metaFile = await fetchCachedFile(
            baseUrl,
            CacheFiles.META_FILE_NAME,
            shared,
            false,
            cache,
            signal,
            undefined,
            { maxBytes: MAX_CACHE_INDEX_COUNT * SectorCluster.SIZE },
        );
        const indexCount = metaFile.data.byteLength / SectorCluster.SIZE;
        if (!Number.isInteger(indexCount) || indexCount > MAX_CACHE_INDEX_COUNT) {
            throw new Error(
                `Invalid cache index table: ${metaFile.data.byteLength} bytes describes ${indexCount} indices`,
            );
        }

        if (indicesToLoad.length === 0) {
            indicesToLoad = Array.from({ length: indexCount }, (_, i) => i);
        } else {
            const uniqueIndices = new Set<number>();
            for (const indexId of indicesToLoad) {
                if (!Number.isInteger(indexId) || indexId < 0 || indexId >= indexCount) {
                    throw new RangeError(
                        `Cache index ID ${String(indexId)} is outside the metadata range 0-${Math.max(indexCount - 1, 0)}`,
                    );
                }
                uniqueIndices.add(indexId);
            }
            indicesToLoad = [...uniqueIndices];
        }

        const dataFilePromise = fetchCachedFile(
            baseUrl,
            CacheFiles.DAT2_FILE_NAME,
            shared,
            true,
            cache,
            signal,
            createLabeledListener("Loading data"),
            skipMainDataCacheWrite
                ? {
                      skipFinalCacheWrite: true,
                      keepPartCacheAfterSuccess: true,
                  }
                : {},
        );

        if (sequential) {
            // Sequential loading: load indices one at a time with phase labels
            const dataFile = await dataFilePromise;
            if (dataFile) {
                files.set(dataFile.name, dataFile.data);
            }

            for (const indexId of indicesToLoad) {
                const indexName = indexNameResolver!(indexId);
                const label = `Loading ${indexName}`;
                // Emit a progress event to show the current phase
                if (progressListener) {
                    progressListener({
                        total: 100,
                        current: 0,
                        part: new Uint8Array(0),
                        label,
                    });
                }
                try {
                    const indexFile = await fetchCachedFile(
                        baseUrl,
                        CacheFiles.INDEX_FILE_PREFIX + indexId,
                        shared,
                        false,
                        cache,
                        signal,
                        undefined,
                        { maxBytes: MAX_CACHE_INDEX_FILE_BYTES },
                    );
                    if (indexFile) {
                        files.set(indexFile.name, indexFile.data);
                    }
                } catch (e) {
                    console.error(`Failed to load index ${indexId}:`, e);
                }
            }
        } else {
            const indexFilesPromise = mapWithConcurrency(
                indicesToLoad,
                CACHE_INDEX_FETCH_CONCURRENCY,
                (indexId) =>
                    fetchCachedFile(
                        baseUrl,
                        CacheFiles.INDEX_FILE_PREFIX + indexId,
                        shared,
                        false,
                        cache,
                        signal,
                        undefined,
                        { maxBytes: MAX_CACHE_INDEX_FILE_BYTES },
                    ).catch(console.error),
            );

            const [dataFile, indexFiles] = await Promise.all([
                dataFilePromise,
                indexFilesPromise,
            ]);
            for (const file of [dataFile, ...indexFiles]) {
                if (file) {
                    files.set(file.name, file.data);
                }
            }
        }

        files.set(metaFile.name, metaFile.data);

        return new CacheFiles(files);
    }

    /**
     * Fetch a single index file.
     * Used for incremental loading where indices are loaded on demand.
     */
    static async fetchSingleIndex(
        baseUrl: string,
        cacheName: string,
        indexId: number,
        shared: boolean = false,
        signal?: AbortSignal,
        progressListener?: ProgressListener,
    ): Promise<ArrayBuffer | null> {
        if (!Number.isInteger(indexId) || indexId < 0 || indexId > 255) return null;
        const cache = await openCache(cacheName);
        try {
            const indexFile = await fetchCachedFile(
                baseUrl,
                CacheFiles.INDEX_FILE_PREFIX + indexId,
                shared,
                false,
                cache,
                signal,
                progressListener,
                {
                    maxBytes:
                        indexId === 255
                            ? MAX_CACHE_INDEX_COUNT * SectorCluster.SIZE
                            : MAX_CACHE_INDEX_FILE_BYTES,
                },
            );
            return indexFile?.data ?? null;
        } catch (e) {
            console.error(`Failed to load index ${indexId}:`, e);
            return null;
        }
    }

    constructor(readonly files: Map<string, ArrayBuffer>) {}

    /** Add a file to the cache (for incremental loading) */
    addFile(name: string, data: ArrayBuffer): void {
        this.files.set(name, data);
    }

    getFileNames(): string[] {
        return Array.from(this.files.keys());
    }
}

export type DownloadProgress = {
    total: number;
    current: number;
    part: Uint8Array;
    /** Current loading phase label (e.g., "Loading models") */
    label?: string;
};

export type ProgressListener = (progress: DownloadProgress) => void;

function ReadableBufferStream(ab: ArrayBuffer): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(ab));
            controller.close();
        },
    });
}

async function toBufferParts(
    response: Response,
    offset: number,
    progressListener?: ProgressListener,
    maxBytes: number = MAX_CACHE_FILE_BYTES,
): Promise<Uint8Array[]> {
    const resource = response.url || "cache response";
    assertByteLengthWithinLimit(offset, resource, maxBytes);
    const contentLengthHeader = response.headers.get("Content-Length");
    let contentLength = offset;
    if (contentLengthHeader !== null) {
        const declaredLength = Number(contentLengthHeader);
        if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
            throw new RangeError(`Invalid Content-Length for ${resource}`);
        }
        contentLength = addByteLengthsWithinLimit(offset, declaredLength, resource, maxBytes);
    }
    if (!response.body) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        const total = addByteLengthsWithinLimit(offset, bytes.byteLength, resource, maxBytes);
        if (progressListener) {
            progressListener({ total, current: total, part: bytes });
        }
        return bytes.byteLength > 0 ? [bytes] : [];
    }

    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let currentLength = offset;

    if (progressListener) {
        progressListener({
            total: contentLength,
            current: currentLength,
            part: new Uint8Array(0),
        });
    }

    try {
        for (let res = await reader.read(); !res.done && res.value; res = await reader.read()) {
            currentLength = addByteLengthsWithinLimit(
                currentLength,
                res.value.byteLength,
                resource,
                maxBytes,
            );
            parts.push(res.value);
            if (progressListener) {
                progressListener({
                    total: contentLength,
                    current: currentLength,
                    part: res.value,
                });
            }
        }
    } catch (error) {
        try {
            await reader.cancel();
        } catch {}
        throw error;
    }
    return parts;
}

function partsToBuffer(
    parts: Uint8Array[],
    shared: boolean,
    maxBytes: number = MAX_CACHE_FILE_BYTES,
): ArrayBuffer {
    let totalLength = 0;
    for (const part of parts) {
        totalLength = addByteLengthsWithinLimit(
            totalLength,
            part.byteLength,
            "cache assembly",
            maxBytes,
        );
    }

    const canShare = shared && typeof SharedArrayBuffer !== "undefined";
    const sab = canShare ? new SharedArrayBuffer(totalLength) : new ArrayBuffer(totalLength);
    const u8 = new Uint8Array(sab);
    let offset = 0;
    for (const buffer of parts) {
        u8.set(buffer, offset);
        offset += buffer.byteLength;
    }
    return sab as ArrayBuffer;
}

/** Read a cached/network response without allowing its body to exceed a known bound. */
export async function readCacheResponseBytes(
    response: Response,
    maxBytes: number,
): Promise<Uint8Array> {
    const parts = await toBufferParts(response, 0, undefined, maxBytes);
    return new Uint8Array(partsToBuffer(parts, false, maxBytes));
}

type CachedFile = {
    name: string;
    data: ArrayBuffer;
};

type CacheWriteOptions = {
    /** Skip writing the fully assembled file entry (e.g., giant dat2 blob). */
    skipFinalCacheWrite: boolean;
    /** Keep part entries after a successful download instead of deleting them. */
    keepPartCacheAfterSuccess: boolean;
    /** Maximum accepted bytes for this specific cache artifact. */
    maxBytes: number;
};

async function fetchCachedFile(
    baseUrl: string,
    name: string,
    shared: boolean,
    incremental: boolean,
    cache: CacheLike,
    signal?: AbortSignal,
    progressListener?: ProgressListener,
    cacheWriteOptions: Partial<CacheWriteOptions> = {},
): Promise<CachedFile> {
    const {
        skipFinalCacheWrite = false,
        keepPartCacheAfterSuccess = false,
        maxBytes = MAX_CACHE_FILE_BYTES,
    } = cacheWriteOptions;
    assertByteLengthWithinLimit(0, name, maxBytes);

    const path = baseUrl + name;
    const manifestUrl = path + "/part/manifest";
    const cachedResp = await cache.match(path);
    if (cachedResp) {
        const parts = await toBufferParts(cachedResp, 0, progressListener, maxBytes);
        return {
            name,
            data: partsToBuffer(parts, shared, maxBytes),
        };
    }
    const partUrls: RequestInfo[] = [];
    const existingPartUrlsByIndex = new Map<number, RequestInfo>();
    const partBuffers: Uint8Array[][] = [];
    let knownTotalBytes: number | undefined;
    if (incremental) {
        const manifestResp = await cache.match(manifestUrl);
        if (manifestResp) {
            try {
                const manifestBytes = partsToBuffer(
                    await toBufferParts(
                        manifestResp,
                        0,
                        undefined,
                        MAX_CACHE_PART_MANIFEST_BYTES,
                    ),
                    false,
                    MAX_CACHE_PART_MANIFEST_BYTES,
                );
                const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
                    total?: number;
                };
                if (
                    typeof manifest.total === "number" &&
                    Number.isSafeInteger(manifest.total) &&
                    manifest.total >= 0 &&
                    manifest.total <= maxBytes
                ) {
                    knownTotalBytes = manifest.total;
                }
            } catch {}
        }

        const partResponses = cache.matchAll
            ? await cache.matchAll(path + "/part/", { ignoreSearch: true })
            : [];
        let acceptedPartCount = 0;
        for (const partResp of partResponses) {
            if (acceptedPartCount >= MAX_CACHE_PARTS) break;
            const partHeader = partResp.headers.get("Cache-Part");
            if (partHeader === null) {
                continue;
            }
            const index = Number(partHeader);
            if (!Number.isInteger(index) || index < 0 || index >= MAX_CACHE_PARTS) {
                continue;
            }
            const partUrl = path + "/part/?p=" + index;
            partUrls.push(partUrl);
            existingPartUrlsByIndex.set(index, partUrl);
            partBuffers[index] = await toBufferParts(partResp, 0, undefined, maxBytes);
            acceptedPartCount++;
        }
    }

    const parts: Uint8Array[] = [];
    let partCount = 0;
    let offset = 0;
    for (let i = 0; i < partBuffers.length; i++) {
        const partBuffer = partBuffers[i];
        if (!partBuffer) {
            break;
        }
        partCount++;
        for (const part of partBuffer) {
            parts.push(part);
            offset = addByteLengthsWithinLimit(offset, part.byteLength, path, maxBytes);
        }
    }

    if (incremental && offset > 0 && knownTotalBytes === undefined) {
        try {
            const headResp = await fetch(path, {
                method: "HEAD",
                signal,
            });
            if (headResp.ok) {
                const rawLengthHeader = headResp.headers.get("Content-Length");
                if (rawLengthHeader !== null) {
                    knownTotalBytes = assertByteLengthWithinLimit(
                        Number(rawLengthHeader),
                        path,
                        maxBytes,
                    );
                }
            }
        } catch (error) {
            if (error instanceof RangeError) throw error;
        }
    }

    let completedByKnownSize = false;
    if (typeof knownTotalBytes === "number" && offset > 0) {
        if (offset > knownTotalBytes) {
            // Cached parts are inconsistent (too many bytes). Restart from byte 0.
            parts.length = 0;
            offset = 0;
            partCount = 0;
        } else if (offset === knownTotalBytes) {
            completedByKnownSize = true;
        }
    }

    let resp: Response | null = null;
    if (!completedByKnownSize) {
        const headers: HeadersInit = {};
        if (offset > 0) {
            headers["Range"] = `bytes=${offset}-${Number.MAX_SAFE_INTEGER}`;
        }

        resp = await fetch(path, {
            headers,
            signal,
        });
    }

    const completedByCachedParts = !!resp && offset > 0 && resp.status === 416;
    const rangeIgnoredByServer = !!resp && offset > 0 && resp.status === 200;
    if (resp && !completedByCachedParts && resp.status !== 200 && resp.status !== 206) {
        throw new Error("Failed downloading " + path + ", " + resp.status);
    }
    if (resp?.status === 206) {
        const range = parseContentRange(resp.headers.get("Content-Range"));
        if (!range || range.start !== offset) {
            try {
                await resp.body?.cancel();
            } catch {}
            throw new Error(`Invalid resumed range response for ${path} at byte ${offset}`);
        }
        if (range.total !== undefined) {
            assertByteLengthWithinLimit(range.total, path, maxBytes);
        }
        if (knownTotalBytes !== undefined && range.total !== undefined && range.total !== knownTotalBytes) {
            try {
                await resp.body?.cancel();
            } catch {}
            throw new Error(
                `Cached size for ${path} is ${knownTotalBytes}, but server reports ${range.total}`,
            );
        }
    }
    if (rangeIgnoredByServer) {
        // Server ignored the range request; restart assembly from byte 0.
        parts.length = 0;
        offset = 0;
        partCount = 0;
    }
    let downloadedBytes = 0;
    const cacheUpdates: Promise<void>[] = [];
    let partCache: Uint8Array[] = [];
    let partCacheLength = 0;
    const flushPartCache = () => {
        if (!(incremental && partCacheLength > 0)) {
            return;
        }
        const chunkParts = partCache;
        const chunkLength = partCacheLength;
        partCache = [];
        partCacheLength = 0;

        const partUrl = path + "/part/?p=" + partCount;
        partUrls.push(partUrl);
        const partResp = new Response(ReadableBufferStream(partsToBuffer(chunkParts, false, maxBytes)), {
            status: 200,
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Length": chunkLength.toString(),
                "Cache-Part": partCount.toString(),
            },
        });
        try {
            Object.defineProperty(partResp, "url", { value: partUrl });
        } catch {}
        const update = cache.put(partUrl, partResp);
        cacheUpdates.push(update);
        partCount++;
    };

    const partProgressListener = (progress: DownloadProgress) => {
        if (incremental && progress.part.byteLength > 0) {
            partCache.push(progress.part);
            partCacheLength = addByteLengthsWithinLimit(
                partCacheLength,
                progress.part.byteLength,
                path,
                maxBytes,
            );

            // cache every 1% of the total file size
            const partCacheThreshold = Math.max(progress.total * 0.01, 1000 * 1024);

            if (partCacheLength > partCacheThreshold) {
                flushPartCache();
            }
        }
        if (progressListener) {
            progressListener(progress);
        }
    };
    if (completedByKnownSize || completedByCachedParts) {
        if (progressListener) {
            progressListener({
                total: offset,
                current: offset,
                part: new Uint8Array(0),
            });
        }
    } else {
        const newParts = await toBufferParts(resp!, offset, partProgressListener, maxBytes);
        for (const part of newParts) {
            parts.push(part);
            downloadedBytes += part.byteLength;
        }
    }

    // Persist trailing bytes that did not cross the threshold.
    flushPartCache();

    const buffer = partsToBuffer(parts, shared, maxBytes);
    const reusedBytes = Math.max(buffer.byteLength - downloadedBytes, 0);

    if (!skipFinalCacheWrite) {
        await cache.put(
            path,
            new Response(ReadableBufferStream(buffer), {
                status: 200,
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Length": buffer.byteLength.toString(),
                },
            }),
        );
    }

    if (incremental) {
        await Promise.all(cacheUpdates);
        if (!keepPartCacheAfterSuccess) {
            await Promise.allSettled([
                ...partUrls.map((url) => cache.delete(url)),
                cache.delete(manifestUrl),
            ]);
        } else {
            await cache.put(
                manifestUrl,
                new Response(JSON.stringify({ total: buffer.byteLength }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }),
            );
            console.log(
                `[storage] ${name} resume stats: reused=${reusedBytes} downloaded=${downloadedBytes} total=${buffer.byteLength}`,
            );
            // Keep only contiguous part entries [0..partCount-1] and prune stale tails.
            await Promise.allSettled(
                Array.from(existingPartUrlsByIndex, ([index, url]) =>
                    index >= partCount ? cache.delete(url) : Promise.resolve(false),
                ),
            );
        }
    }

    return {
        name,
        data: buffer,
    };
}
