import assert from "node:assert/strict";

import { parseCacheInfos, parseXteaMap } from "@client/core/cache/CacheMetadata";
import { MAX_CACHE_FILE_BYTES } from "@august/osrs-engine/cache/CacheLimits";

const valid = parseCacheInfos([
    {
        name: "osrs-237_2026-03-25",
        game: "oldschool",
        environment: " live ",
        revision: 237,
        timestamp: "2026-03-25T00:00:00.000Z",
        size: 123_456,
    },
]);
assert.deepEqual(valid, [
    {
        name: "osrs-237_2026-03-25",
        game: "oldschool",
        environment: "live",
        revision: 237,
        timestamp: "2026-03-25T00:00:00.000Z",
        size: 123_456,
    },
]);

assert.throws(() => parseCacheInfos({}), /must be a JSON array/);
assert.throws(
    () => parseCacheInfos([{ ...valid[0], name: "../outside" }]),
    /invalid name/,
);
assert.throws(
    () => parseCacheInfos([{ ...valid[0] }, { ...valid[0] }]),
    /duplicate name/,
);
assert.throws(
    () => parseCacheInfos([{ ...valid[0], revision: 237.5 }]),
    /invalid revision/,
);
assert.throws(
    () => parseCacheInfos([{ ...valid[0], timestamp: "not-a-date" }]),
    /invalid timestamp/,
);
assert.throws(
    () => parseCacheInfos([{ ...valid[0], size: MAX_CACHE_FILE_BYTES + 1 }]),
    /invalid size/,
);
assert.throws(
    () => parseCacheInfos(Array.from({ length: 1_025 }, () => ({ ...valid[0] }))),
    /more than 1024 entries/,
);

assert.deepEqual(
    [...parseXteaMap({ "12850": [1, -2, 3, 4] })],
    [[12_850, [1, -2, 3, 4]]],
);
assert.throws(() => parseXteaMap([]), /must be a JSON object/);
assert.throws(() => parseXteaMap({ "12x": [1, 2, 3, 4] }), /invalid region/);
assert.throws(() => parseXteaMap({ "65536": [1, 2, 3, 4] }), /invalid region/);
assert.throws(() => parseXteaMap({ "12850": [1, 2, 3] }), /four integers/);
assert.throws(() => parseXteaMap({ "12850": [1, 2, 3, 0x1_0000_0000] }), /four integers/);

console.log("cache metadata validation tests passed");
