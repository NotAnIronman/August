import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { PlayerRaidState } from "@server/game/state/PlayerRaidState";
import { register } from "@server/content/modules/theatre-of-blood";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";

const data=loadCache(loadCacheList(loadCacheInfos()).latest);
const locs=getCacheLoaderFactory(data.info,CacheSystem.fromFiles("dat2",data.files)).getLocTypeLoader();
const registry=new ScriptRegistry();
let developer=false;
let dialog:any,created:any,current:any;
let creations=0;
const player:any={id:1,tileX:3677,tileY:3219,level:0,worldViewId:-1,raidProgress:new PlayerRaidState()};
const services:any={
    data:{getLocDefinition:(id:number)=>locs.load(id)},system:{isDeveloper:()=>developer},
    instances:{theatreRuns:{},get:()=>current,buildTemplate:buildInstanceTemplate,create:(_p:any,spec:any)=>{
        creations++;created=spec;current={definitionId:spec.definitionId};return current;
    },leave:()=>{current=undefined;}},
    dialog:{openDialogOptions:(_p:any,spec:any)=>{dialog=spec;}},messaging:{sendGameMessage:()=>{}},
};
register(registry,services);
for(const id of [32653,33113,32751]) {
    const actions=locs.load(id).actions.filter((a:any)=>typeof a === "string" && a.trim() && a.toLowerCase() !== "examine");
    assert(actions.length>0,`cache object ${id} must have a usable action`);
    for(const action of actions) assert(registry.findLocInteraction(id,action!),`named action ${id}/${action} must be registered`);
}
const open=registry.findLocInteraction(32653,locs.load(32653).actions.find(Boolean)!)!;
open({player,services,tick:1,locId:32653,tile:{x:3677,y:3219},level:0});
assert(!dialog.options.some((s:string)=>s.includes("Preview")),"ordinary accounts have no preview controls");
dialog.onSelect(3);assert.equal(creations,0,"forged preview choice is not privileged");
developer=true;
open({player,services,tick:1,locId:32653,tile:{x:3677,y:3219},level:0});
dialog.onSelect(3);assert.equal(dialog.options[0],"Maiden");
dialog.onSelect(3);assert.equal(dialog.options[1],"Xarpus");
dialog.onSelect(1);
// TypeScript does not track assignments performed by the dialog callback.
const readCreated = (): {definitionId:string;destination:{x:number;y:number;level:number}} | undefined => created;
const previewSpec = readCreated();
assert(previewSpec);
assert.equal(previewSpec.definitionId,"theatre-preview:4");
assert.deepEqual(previewSpec.destination,{x:3170,y:4375,level:1});
assert(!player.raidProgress.checkpoint,"preview does not create progression");
registry.findLocInteraction(32751,locs.load(32751).actions.find(Boolean)!)!({player,services,tick:1,locId:32751,tile:{x:3170,y:4375},level:1});
assert.equal(current,undefined,"preview exit leaves the private room");
console.log("Theatre cache-named entrance/exits and developer-only room preview passed");
