import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache,loadCacheList,loadCacheInfos } from "@tools/cache/client/load-util";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { SceneBuilder,LocLoadType } from "@august/osrs-engine/scene/SceneBuilder";
import { theatreRoomGeometry } from "@server/content/modules/theatre-of-blood/rooms";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { SailingWorldView } from "@server/game/sailing/SailingWorldView";
import { PathService } from "@server/pathfinding/PathService";
import { PlayerInteractionSystem } from "@server/game/interactions/PlayerInteractionSystem";
import { LockState } from "@server/game/model/LockState";
import { LocInteractionHandler } from "@server/game/interactions/LocInteractionHandler";
import { THEATRE_ARENAS } from "@server/content/modules/theatre-of-blood/arenas";
import { VAULT_STAIRS,VERZIK_STAIRS_TILE } from "@server/content/modules/theatre-of-blood/vault";
const data=loadCache(loadCacheList(loadCacheInfos()).latest);
const factory=getCacheLoaderFactory(data.info,CacheSystem.fromFiles("dat2",data.files)),locs=factory.getLocTypeLoader();
const models=new LocModelLoader(locs,factory.getModelLoader(),factory.getTextureLoader(),factory.getSeqTypeLoader(),factory.getSeqFrameLoader(),factory.getSkeletalSeqLoader());
const builder=new SceneBuilder(data.info,factory.getMapFileLoader(),factory.getUnderlayTypeLoader(),factory.getOverlayTypeLoader(),locs,models,data.xteas);
const g=theatreRoomGeometry(5),scene=builder.buildInstanceScene(buildInstanceTemplate([g.copy]),g.sceneBase.x,g.sceneBase.y,104,104,false,LocLoadType.NO_MODELS);
const path=new PathService({getMapSquare:()=>undefined} as any);
path.registerWorldViewCollision(4000,new SailingWorldView(4000,g.sceneBase.x,g.sceneBase.y,104,104,scene.collisionMaps));
const spawn=THEATRE_ARENAS.verzik.boss;
assert.deepEqual([spawn.x,spawn.y],[3168,4325]);
const player:any={id:1,tileX:3168,tileY:4303,level:0,worldViewId:4000,lock:LockState.NONE,
    combat:{},energy:{resolveRequestedRun:()=>false},wantsRun:()=>false,canInteract:()=>true,
    getPathQueue:()=>[],setPath:(steps:any)=>{player.steps=steps;},clearPath(){},clearInteraction(){},
    faceTile(){},hasPath:()=>false,wasTeleported:()=>false};
const npc:any={id:10,typeId:spawn.id,tileX:spawn.x,tileY:spawn.y,level:0,worldViewId:4000,
    size:factory.getNpcTypeLoader().load(spawn.id).size,passiveInteractionRange:3,
    getHitpoints:()=>10,hasPath:()=>false,clearInteraction(){},clearPath(){},faceTile(){}};
const socket:any={},dispatches:string[]=[];
const repo:any={get:()=>player,getById:()=>player,forEachBot(){},getSocketByPlayerId:()=>socket};
const runtime:any={queueNpcInteraction:(e:any)=>{assert.equal(e.npc,npc);dispatches.push(e.option);}};
const system:any=new PlayerInteractionSystem(repo,path,undefined,undefined,runtime);
// Exercise actual approach, cache geometry and tick dispatch; cancellation of
// unrelated previous combat/follow state is covered by interaction unit tests.
system.replaceInteractionState=()=>{};
system.resolveRunMode=()=>false;
assert(!system.routePlayerToPassiveNpc(player,{...npc,tileY:4326},false),
    "regression: old throne spawn leaves the closest walkable tile outside talk range");
for(const option of factory.getNpcTypeLoader().load(spawn.id).actions.slice(0,2)) {
    Object.assign(player,{tileX:3168,tileY:4303,steps:undefined});
    const action=option!.toLowerCase(),before=dispatches.length;
    assert(system.startNpcInteraction(socket,npc,action).ok);
    assert(player.steps?.length,"click must route from the arena entrance");
    assert.deepEqual(player.steps.at(-1),{x:3168,y:4322});
    system.updateNpcInteractions(1,()=>npc);
    assert.equal(dispatches.length,before,"no remote start before arrival");
    Object.assign(player,{tileX:3168,tileY:4322});
    system.updateNpcInteractions(2,()=>npc);
    system.updateNpcInteractions(3,()=>npc);
    assert.deepEqual(dispatches.at(-1),action);
    assert.equal(dispatches.length,before+1,"arrival dispatches exactly once");
}
assert.deepEqual(dispatches,["talk-to","quick-start"]);
// The replacement throne form must also have a reachable attack position.
player.combat.weaponCategory=3;
const combatNpc={...npc,typeId:8370,size:factory.getNpcTypeLoader().load(8370).size};
assert(system.routePlayerToNpc(player,combatNpc,8,false,false),"combat form can be reached with ranged attacks after starting");

const locHandler=new LocInteractionHandler(repo,path,locs,undefined,undefined,new Map(),{},system);
const stairs=locs.load(VAULT_STAIRS);
assert.deepEqual(VERZIK_STAIRS_TILE,{x:spawn.x,y:spawn.y,level:0});
const strategy=locHandler.selectLocRouteStrategy(VAULT_STAIRS,VERZIK_STAIRS_TILE,"Climb",stairs.sizeX,stairs.sizeY,0,4000);
const route=path.findPathSteps({from:{x:3168,y:4303,plane:0},to:VERZIK_STAIRS_TILE,size:1,worldViewId:4000},
    {routeStrategy:strategy,maxSteps:128});
assert(route.ok && route.end && strategy.hasArrived(route.end.x,route.end.y,0),"stairs have a genuinely reachable approach after death");
assert.deepEqual(route.end,{x:3168,y:4322});
console.log("Verzik actual cache: both click routes dispatch from reachable floor; post-death stairs are reachable");
