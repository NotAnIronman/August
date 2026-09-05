import assert from "node:assert/strict";
(globalThis as { self?: unknown }).self = globalThis;
const { WebGLMapSquare } = require("@client/engine/rendering/WebGLMapSquare");
const payload = {
    collisionDatas: [],
    tileLocOffsetsByLevel: [new Uint32Array([0, 1])],
    tileLocIdsByLevel: [new Int32Array([1276])],
    tileLocTypeRotByLevel: [new Uint8Array([10])],
    itemLayerHeightsByLevel: [new Uint16Array([42])],
};
const map = Object.assign(Object.create(WebGLMapSquare.prototype), {
    ...payload, collisionMaps: [], npcOccCounts: [], playerOccCounts: [],
    locIdsAtLocalBuffer: [], locTypeRotsAtLocalBuffer: [],
    getLocalTileSpan: () => 1,
});
// Constructors retain the incoming outer arrays. Reapplying/reusing that
// payload must not empty both the map and payload by clearing those arrays.
map.refreshLocSceneMetadata(payload);
assert.deepEqual(map.getLocIdsAtLocal(0, 0, 0), [1276]);
assert.deepEqual(map.getLocTypeRotsAtLocal(0, 0, 0), [10]);
assert.equal(payload.tileLocIdsByLevel[0]?.[0], 1276, "refresh must not mutate the source payload");
map.refreshLocSceneMetadata(payload);
assert.deepEqual(map.getLocIdsAtLocal(0, 0, 0), [1276], "repeated refresh preserves picking");
map.tileLocIdsByLevel = undefined;
map.tileLocOffsetsByLevel = undefined;
map.tileLocTypeRotByLevel = undefined;
map.itemLayerHeightsByLevel = undefined;
map.refreshLocSceneMetadata(payload);
assert.deepEqual(map.getLocIdsAtLocal(0, 0, 0), [1276], "refresh restores previously missing picking metadata");
assert.equal(map.getItemLayerHeightAtLocal(0, 0, 0), 42);
console.log("Object interaction metadata survives aliased payloads and repeated scene updates");
