import assert from "node:assert/strict";

import {
    CacheFiles,
    MAX_LEGACY_MAP_NAMES,
    openCache,
    parseLegacyMapNames,
} from "@august/osrs-engine/cache/CacheFiles";
import { Js5Persistence } from "@august/osrs-engine/cache/js5/Js5Persistence";
import { Js5RangeClient } from "@august/osrs-engine/cache/js5/Js5RangeClient";
import {
    MAX_CACHE_FILE_BYTES,
    addCacheFileByteLengths,
    assertCacheFileByteLength,
} from "@august/osrs-engine/cache/CacheLimits";
import { mapWithConcurrency } from "@august/osrs-engine/util/AsyncConcurrency";

async function main(): Promise<void> {
    assert.equal(assertCacheFileByteLength(MAX_CACHE_FILE_BYTES, "test"), MAX_CACHE_FILE_BYTES);
    assert.throws(
        () => assertCacheFileByteLength(MAX_CACHE_FILE_BYTES + 1, "test"),
        /exceeds the supported cache-file limit/,
    );
    assert.throws(
        () => addCacheFileByteLengths(MAX_CACHE_FILE_BYTES, 1, "test"),
        /exceeds the supported cache-file limit/,
    );
    assert.deepEqual(parseLegacyMapNames(["m50_50", "m50_50", "l50_50"]), [
        "m50_50",
        "l50_50",
    ]);
    assert.throws(() => parseLegacyMapNames(["../outside"]), /invalid file name/);
    assert.throws(
        () => parseLegacyMapNames(new Array(MAX_LEGACY_MAP_NAMES + 1).fill("m0_0")),
        /cannot contain more than/,
    );

    let active = 0;
    let peak = 0;
    const mapped = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return value * 2;
    });
    assert.deepEqual(mapped, [2, 4, 6, 8, 10]);
    assert.equal(peak, 2, "bounded work must preserve ordering without exceeding concurrency");

    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = () => undefined;
    console.warn = () => undefined;
    try {
        globalThis.fetch = (async () =>
            new Response(new Uint8Array([1]), {
                status: 200,
                headers: { "Content-Length": String(MAX_CACHE_FILE_BYTES + 1) },
            })) as typeof fetch;

        await assert.rejects(
            CacheFiles.fetchDat(
                "https://cache.invalid/oversized/",
                `resource-limit-${Date.now()}`,
                false,
            ),
            /exceeds the supported .*limit/,
        );

        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            const bytes = url.endsWith(CacheFiles.META_FILE_NAME)
                ? new Uint8Array(257 * 6)
                : new Uint8Array([1]);
            return new Response(bytes, {
                status: 200,
                headers: { "Content-Length": String(bytes.byteLength) },
            });
        }) as typeof fetch;

        await assert.rejects(
            CacheFiles.fetchDat2(
                "https://cache.invalid/too-many-indices/",
                `index-limit-${Date.now()}`,
                [],
                false,
            ),
            /exceeds the supported 1536-byte limit/,
        );

        const requestedUrls: string[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            requestedUrls.push(url);
            if (url.endsWith("maps.json")) {
                return new Response(new Uint8Array([91, 93]), {
                    status: 200,
                    headers: { "Content-Length": String(4 * 1024 * 1024 + 1) },
                });
            }
            return new Response(new Uint8Array([1]), { status: 200 });
        }) as typeof fetch;

        await CacheFiles.fetchLegacy(
            "https://cache.invalid/legacy/",
            `legacy-map-limit-${Date.now()}`,
            false,
        );
        assert.equal(
            requestedUrls.some((url) => url.includes("/maps/")),
            false,
            "an oversized map catalog must not fan out map requests",
        );

        const persistenceCacheName = `persisted-range-limit-${Date.now()}`;
        const dat2Path = "https://cache.invalid/persisted/main_file_cache.dat2";
        const rangeKey = `${dat2Path}/range/?s=0&n=1`;
        const persistenceCache = await openCache(persistenceCacheName);
        await persistenceCache.put(
            rangeKey,
            new Response(new Uint8Array([1]), {
                headers: {
                    "Content-Length": "1024",
                    "Range-Key": rangeKey,
                    "Range-Start": "0",
                },
            }),
        );
        const persistence = new Js5Persistence(
            persistenceCacheName,
            dat2Path,
            new ArrayBuffer(1024),
        );
        assert.equal(
            await persistence.readPersistedRangeContaining(0, 1),
            undefined,
            "a truncated persisted range must be ignored",
        );

        globalThis.fetch = (async () =>
            new Response(new Uint8Array([1]), {
                status: 206,
                headers: {
                    "Content-Length": "2",
                    "Content-Range": "bytes 0-0/1024",
                },
            })) as typeof fetch;
        const rangeClient = new Js5RangeClient(
            "https://cache.invalid/range/main_file_cache.dat2",
            { dataFile: new ArrayBuffer(1024), onMiss: undefined } as any,
        );
        await assert.rejects(
            (rangeClient as any).fetchRange(0, 1),
            /exceeds the supported 1-byte limit/,
            "on-demand ranges must be bounded before response allocation",
        );
        rangeClient.close();
    } finally {
        globalThis.fetch = originalFetch;
        console.error = originalError;
        console.warn = originalWarn;
    }

    console.log("cache resource-limit regression tests passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
