import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const f = getCacheLoaderFactory(data.info, CacheSystem.fromFiles("dat2", data.files));
for (const id of [7851, 7852, 7853, 7882, 7883, 7884, 7886, 7887, 7888, 14860]) {
    const n = f.getNpcTypeLoader().load(id);
    assert(n.modelIds?.length);
    assert.equal(n.size, id === 7887 || id === 7888 ? 6 : 4);
}
for (let strength = 1; strength <= 5; strength++)
    for (const active of [false, true]) {
        const id = 57917 + (strength - 1) * 2 + Number(active), loc = f.getLocTypeLoader().load(id);
        assert.equal(loc.name, "Whirlwind");
        assert(loc.models?.flat().length);
        assert.equal(loc.seqId, (active ? 12576 : 12566) + strength - 1);
        assert.equal(loc.clipType, 0, "whirlwinds must allow walking out/stacking");
        assert.equal(loc.transforms, undefined);
        assert(f.getSeqTypeLoader().load(12581 + strength - 1), "native burst sequence exists");
    }
for (const id of [31678, 31679, 31680]) {
    const loc = f.getLocTypeLoader().load(id);
    assert(loc.models?.flat().length);
    assert.equal(loc.clipType, 0, "players must be able to absorb spheres");
}
assert.equal(f.getObjTypeLoader().load(1127).weight / 1000, 9.979, "canonical cache weights are grams");
for (const id of [1312, 1313, 1416, 1424, 1434, 1435, 1436, 1444, 1445, 1446, 1447, 1448, 1449, 3459, 3461]) {
    const g = f.getSpotAnimTypeLoader().load(id);
    assert(g.modelId >= 0);
}
console.log("Native Guardian forms, nonblocking spheres/whirlwinds, attacks and cache weights validated.");
