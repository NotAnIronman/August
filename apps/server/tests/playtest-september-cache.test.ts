import assert from "node:assert/strict";
import {CacheSystem} from "@august/osrs-engine/cache/CacheSystem";
import {getCacheLoaderFactory} from "@august/custom-content/items/cacheLoaderDecorator";
import {loadCache,loadCacheList,loadCacheInfos} from "@tools/cache/client/load-util";
import {getItemDefinition} from "@server/data/items";
import {THEATRE_COMMONS} from "@server/content/modules/theatre-of-blood/rewards";
import {PICKAXES} from "@server/content/gamemodes/vanilla/skills/mining/miningData";
import {LocInteractionHandler} from "@server/game/interactions/LocInteractionHandler";
import {ScriptRegistry} from "@server/game/scripts/ScriptRegistry";
import {registerBankingHandlers} from "@server/content/gamemodes/vanilla/banking";
const data=loadCache(loadCacheList(loadCacheInfos()).latest);
const f=getCacheLoaderFactory(data.info,CacheSystem.fromFiles("dat2",data.files));
const registry=new ScriptRegistry();let opened=0;
registerBankingHandlers(registry,{} as any);
const bank=registry.findLocInteraction(4483,"Use");assert(bank);
bank({player:{},services:{banking:{openBank:()=>opened++}}} as any);
assert.equal(opened,1,"native Use label reaches the bank handler");
for(const id of [11388,11389,4483]) {
 const loc=f.getLocTypeLoader().load(id);
 assert.equal(loc.actions[0],id===4483?"Use":"Mine");
 if(id!==4483){
   const handler=new LocInteractionHandler({} as any,{getCollisionFlagAt:()=>0x7fffffff} as any,f.getLocTypeLoader(),undefined,undefined,new Map(),{},{} as any);
   const route=handler.selectLocRouteStrategy(id,{x:10,y:10},"Mine",1,1,0);
   assert(route.hasArrived(9,10,0),"crystals can be mined from adjacent floor despite their wall collision");
   assert(!route.hasArrived(8,10,0),"mining still requires adjacent reach");
 }
}
for(const [id] of THEATRE_COMMONS){assert.equal(f.getObjTypeLoader().load(id).stackability,1);assert.equal(getItemDefinition(id)?.stackable,true,`reward ${id} must stack`);}
for(const pick of PICKAXES){assert(f.getSeqTypeLoader().load(pick.animation).frameIds?.length>0,`pickaxe ${pick.itemId} sequence exists`);}
const textures=f.getTextureLoader() as any;
for(const id of [6570,21295]) {
 const obj=f.getObjTypeLoader().load(id) as any;
 for(const modelId of [obj.model,obj.maleModel,obj.femaleModel]){
   const model=f.getModelLoader().getModel(modelId)!;
   const textureIds=[...new Set(model.faceTextures??[])].filter(t=>t>=0);
   assert(textureIds.length>0);
   assert(textureIds.some(t=>textures.definitions.get(t)?.spriteIds.includes(id===6570?485:318)),"cape texture uses the requested native sprite");
 }
}
console.log("Cache-verified amethyst wall reach, stackable rewards, pickaxe sequences and cape sprites passed");
