import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { SceneBuilder, LocLoadType } from "@august/osrs-engine/scene/SceneBuilder";
import { getIdFromTag } from "@august/osrs-engine/scene/entity/EntityTag";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { VAULT_COPY,VAULT_CHESTS,VAULT_ENTRANCE,VAULT_SCENE_BASE,VAULT_CRYSTAL_TILE } from "@server/content/modules/theatre-of-blood/vault";
import { THEATRE_COMMONS,THEATRE_UNIQUES,THEATRE_PET,ELITE_CLUE } from "@server/content/modules/theatre-of-blood/rewards";
const data=loadCache(loadCacheList(loadCacheInfos()).latest);
const factory=getCacheLoaderFactory(data.info,CacheSystem.fromFiles("dat2",data.files));
const locs=factory.getLocTypeLoader(),objs=factory.getObjTypeLoader();
for(const id of [32990,32991,32992,32993,32994,41746]) {
 const l=locs.load(id);assert.equal(l.name,"Monumental chest");assert.equal(l.sizeX,3);assert.equal(l.sizeY,3);
 assert(l.models.length);assert(!l.transforms);
 assert.equal(l.actions[0],id===32990||id===32991?undefined:id===32992||id===32993?"Open":"Search");
}
assert.equal(locs.load(32995).actions[0],"Climb");assert.equal(locs.load(32996).actions[0],"Use");
const names=["Vial of blood","Death rune","Blood rune","Swamp tar","Coal","Gold ore","Molten glass","Adamantite ore","Runite ore","Wine of zamorak","Potato cactus","Grimy cadantine","Grimy avantoe","Grimy toadflax","Grimy kwuarm","Grimy irit leaf","Grimy ranarr weed","Grimy snapdragon","Grimy lantadyme","Grimy dwarf weed","Grimy torstol","Battlestaff","Rune battleaxe","Rune platebody","Rune chainbody","Palm tree seed","Yew seed","Magic seed","Mahogany seed"];
THEATRE_COMMONS.forEach(([id],i)=>{const obj=objs.load(id);assert.equal(obj.name,names[i],`${id}: correct common item`);assert(obj.stackability>0,`${id}: stackable or noted`);});
assert.equal(objs.load(THEATRE_COMMONS[0][0]).note,22446);
assert.deepEqual(THEATRE_UNIQUES.map(([id])=>objs.load(id).name),["Avernic defender hilt","Ghrazi rapier","Sanguinesti staff (uncharged)","Justiciar faceguard","Justiciar chestguard","Justiciar legguards","Scythe of vitur (uncharged)"]);
assert.equal(objs.load(THEATRE_PET).name,"Lil' zik");assert.equal(objs.load(ELITE_CLUE).name,"Clue scroll (elite)");
assert.equal(factory.getStructTypeLoader()!.load(506).params.get(689),"Theatre of Blood");
const models=new LocModelLoader(locs,factory.getModelLoader(),factory.getTextureLoader(),factory.getSeqTypeLoader(),factory.getSeqFrameLoader(),factory.getSkeletalSeqLoader());
const builder=new SceneBuilder(data.info,factory.getMapFileLoader(),factory.getUnderlayTypeLoader(),factory.getOverlayTypeLoader(),locs,models,data.xteas);
const scene=builder.buildInstanceScene(buildInstanceTemplate([VAULT_COPY]),VAULT_SCENE_BASE.x,VAULT_SCENE_BASE.y,104,104,false,LocLoadType.NO_MODELS);
assert(scene.tiles[0][VAULT_ENTRANCE.x-VAULT_SCENE_BASE.x][VAULT_ENTRANCE.y-VAULT_SCENE_BASE.y]);
let crystal=false;
for(const plane of scene.tiles)for(const row of plane)for(const tile of row) {
 if(!tile)continue;
 for(const l of tile.locs)if(getIdFromTag(l.tag)===32996){assert.equal(tile.level,0);assert.equal(tile.x+VAULT_SCENE_BASE.x,VAULT_CRYSTAL_TILE.x);assert.equal(tile.y+VAULT_SCENE_BASE.y,VAULT_CRYSTAL_TILE.y);crystal=true;}
}
assert(crystal,"exit crystal is supplied by the copied cache, not an invented location");
for(const chest of VAULT_CHESTS)for(let x=chest.x;x<chest.x+3;x++)for(let y=chest.y;y<chest.y+3;y++) {
 const tile=scene.tiles[0][x-VAULT_SCENE_BASE.x][y-VAULT_SCENE_BASE.y];assert(tile,`chest footprint has floor ${x},${y}`);
 // Rear edge overlaps the room's invisible boundary strips, which stay intact;
 // no furniture or other chests may occupy the requested footprint.
 assert(tile.locs.every(l=>locs.load(getIdFromTag(l.tag)).clipType===0 || getIdFromTag(l.tag)===32997));
}
console.log("Vault cache: floor, crystal, chest footprints/menus and all reward IDs verified");
