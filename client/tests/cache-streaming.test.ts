import assert from "node:assert/strict";

import { parseContentRange, validatePartialContentResponse } from "../rs/cache/js5/HttpRange";
import { PresenceBitset } from "../rs/cache/js5/PresenceBitset";
import { rebuildGroundItemsForMap } from "../render/render/draw3";

function contentRangeParsing(): void {
    assert.deepEqual(parseContentRange("bytes 10-19/100"), {
        start: 10,
        endExclusive: 20,
        total: 100,
    });
    assert.deepEqual(parseContentRange("bytes 0-0/*"), {
        start: 0,
        endExclusive: 1,
        total: undefined,
    });
    assert.equal(parseContentRange("bytes 10-9/100"), undefined);
    assert.equal(parseContentRange("bytes 0-100/100"), undefined);
    assert.equal(parseContentRange("garbage"), undefined);
}

function exactRangeValidation(): void {
    const valid = new Response(new Uint8Array(10), {
        status: 206,
        headers: { "Content-Range": "bytes 10-19/100" },
    });
    assert.deepEqual(validatePartialContentResponse(valid, 10, 20, "cache.dat2"), {
        start: 10,
        endExclusive: 20,
        total: 100,
    });

    const missingHeader = new Response(new Uint8Array(10), { status: 206 });
    assert.throws(
        () => validatePartialContentResponse(missingHeader, 10, 20, "cache.dat2"),
        /Invalid Content-Range/,
    );

    const wrongRange = new Response(new Uint8Array(10), {
        status: 206,
        headers: { "Content-Range": "bytes 20-29/100" },
    });
    assert.throws(
        () => validatePartialContentResponse(wrongRange, 10, 20, "cache.dat2"),
        /Unexpected Content-Range/,
    );
}

function sectorPresenceTracking(): void {
    const presence = PresenceBitset.forSectorCount(20, false);
    assert.equal(presence.hasSectors(3, 4), false);
    presence.markSectors(3, 4);
    assert.equal(presence.hasSectors(3, 4), true);
    assert.equal(presence.hasSectors(2, 5), false);
    presence.markSectors(0, 16);
    assert.equal(presence.hasSectors(0, 16), true);
    assert.equal(presence.hasSectors(19, 2), false);
}

function groundItemsRetryUntilRendererReady(): void {
    const stack = [{}] as any;
    assert.equal(rebuildGroundItemsForMap({} as any, {} as any, stack), true);
    assert.equal(rebuildGroundItemsForMap({} as any, {} as any, undefined), false);
}

contentRangeParsing();
exactRangeValidation();
sectorPresenceTracking();
groundItemsRetryUntilRendererReady();
console.log("Cache streaming regression tests passed");
