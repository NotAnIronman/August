import assert from "node:assert/strict";

import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { WidgetLoader } from "@client/ui/widgets/WidgetLoader";
import { loadCache, loadCacheInfos, loadCacheList } from "@tools/cache/client/load-util";

const cache = CacheSystem.fromFiles(
    "dat2",
    loadCache(loadCacheList(loadCacheInfos()).latest).files,
);
const bank = new WidgetLoader(cache).loadWidgetGroup(12);
const model = bank?.widgets.get((12 << 16) | 55);

assert.ok(model, "bank widget 12:55 should decode");
assert.equal(model.type, 6);
assert.equal(model.parentUid, (12 << 16) | 54);
assert.equal(model.modelId, -1);
console.log("Widget loader regression test passed");
