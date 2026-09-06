import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { SceneBuilder, LocLoadType } from "@august/osrs-engine/scene/SceneBuilder";
import { getIdFromTag } from "@august/osrs-engine/scene/entity/EntityTag";
import { THEATRE_ROOMS, theatreRoomGeometry } from "@server/content/modules/theatre-of-blood/rooms";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { THEATRE_ARENAS, THEATRE_BARRIER_ID } from "@server/content/modules/theatre-of-blood/arenas";
const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const factory = getCacheLoaderFactory(data.info,CacheSystem.fromFiles("dat2",data.files));
const npcs = factory.getNpcTypeLoader(), locs = factory.getLocTypeLoader();
assert.equal(locs.load(THEATRE_BARRIER_ID).actions[0],"Pass");
assert.equal(npcs.load(THEATRE_ARENAS.verzik.boss.id).actions[0],"Talk-to");
const models = new LocModelLoader(locs,factory.getModelLoader(),factory.getTextureLoader(),factory.getSeqTypeLoader(),factory.getSeqFrameLoader(),factory.getSkeletalSeqLoader());
const builder = new SceneBuilder(data.info,factory.getMapFileLoader(),factory.getUnderlayTypeLoader(),factory.getOverlayTypeLoader(),locs,models,data.xteas);
for(let i=0;i<THEATRE_ROOMS.length;i++) {
 const g=theatreRoomGeometry(i);
 const arena=THEATRE_ARENAS[g.room.id], boss=npcs.load(arena.boss.id);
 assert(boss.name && boss.name!=="null");assert(boss.modelIds?.length,"boss must have a visible cache model");
 assert(!boss.transforms,"initial boss form must not depend on unconfigured varbits");
 assert(arena.boss.x>=g.bounds.minX&&arena.boss.x<=g.bounds.maxX&&arena.boss.y>=g.bounds.minY&&arena.boss.y<=g.bounds.maxY);
 const scene=builder.buildInstanceScene(buildInstanceTemplate([g.copy]),g.sceneBase.x,g.sceneBase.y,104,104,false,LocLoadType.NO_MODELS);
 const seen=new Set<string>();
 for(const plane of scene.tiles) for(const row of plane) for(const tile of row) {
   if(!tile) continue;
   for(const loc of [...tile.locs,...(tile.wall?[tile.wall]:[])]) {
    if(getIdFromTag(loc.tag)!==THEATRE_BARRIER_ID)continue;
    seen.add(`${tile.x+g.sceneBase.x},${tile.y+g.sceneBase.y},${tile.level}`);
   }
 }
 const expected=new Set<string>();
 for(const gate of arena.gates)for(let lane=gate.min;lane<=gate.max;lane++){
    const x=gate.axis==="x"?gate.coordinate:lane, y=gate.axis==="y"?gate.coordinate:lane;
    expected.add(`${x},${y},${g.room.entrance.level}`);
 }
 assert.deepEqual([...seen].sort(),[...expected].sort(),`${g.room.name}: every gate span and plane matches the real scene`);
}
console.log("Theatre cache: six visible boss forms, all entrance/exit barriers, Pass op1 and Verzik Talk-to verified");
