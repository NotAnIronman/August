import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
const data=loadCache(loadCacheList(loadCacheInfos()).latest);
const factory=getCacheLoaderFactory(data.info,CacheSystem.fromFiles("dat2",data.files));
const locs=factory.getLocTypeLoader(), objs=factory.getObjTypeLoader();
const mining=buildMiningLocMap(locs);
for(const [live,empty] of [[11388,11390],[11389,11391]]) {
    assert.equal(locs.load(live).name,"Amethyst crystals");
    assert(locs.load(live).actions.includes("Mine"));
    assert.equal(locs.load(empty).name,"Rocks");
    assert.deepEqual(mining.map.get(live),{rockId:"amethyst",depletedLocId:empty});
}
assert.equal(locs.load(4483).name,"Bank chest");
assert.equal(locs.load(4483).actions[0],"Use");
for(const recipe of LEATHER_RECIPES.filter(r=>r.id.startsWith("hueycoatl")))
    assert.equal(objs.load(recipe.outputItemId).name,recipe.name);
for(const [id,name] of [[28899,"Wyrmling bones"],[28991,"Atlatl dart"],[29378,"Sun-kissed bones"],[29381,"Blessed bone shards"],[30634,"Twinflame staff"]] as const)
    assert.equal(objs.load(id).name,name);
console.log("Cache-verified amethyst variants, bank chest, Hueycoatl products and Lunar/Twinflame IDs passed");
import assert from "node:assert/strict";
import { buildMiningLocMap } from "@server/content/gamemodes/vanilla/skills/mining/miningData";
import { LEATHER_RECIPES } from "@server/content/gamemodes/vanilla/skills/crafting/productionData";
