import assert from "node:assert/strict";
import { PlayerInteractionSystem } from "@server/game/interactions/PlayerInteractionSystem";
import { LockState } from "@server/game/model/LockState";
import { CollisionFlag } from "@server/pathfinding/engine/flag/CollisionFlag";

let clear=true,routes=0,dispatches=0;
const player:any={id:1,tileX:3168,tileY:4323,level:0,worldViewId:4000,lock:LockState.NONE,
    canInteract:()=>true,clearPath(){},clearInteraction(){},faceTile(){},hasPath:()=>false,wasTeleported:()=>false,
    energy:{resolveRequestedRun:()=>false},wantsRun:()=>false};
const npc:any={id:10,typeId:14795,tileX:3168,tileY:4326,level:0,worldViewId:4000,size:1,passiveInteractionRange:3,
    getHitpoints:()=>10,hasPath:()=>false,clearInteraction(){},clearPath(){},faceTile(){}};
const socket:any={};
const repo:any={get:()=>player,getById:()=>player,forEachBot(){},getSocketByPlayerId:()=>socket};
const path:any={getCollisionFlagAt:(_x:number,_y:number,_p:number,view:number)=>{assert.equal(view,4000);return clear?CollisionFlag.OBJECT_PROJECTILE_BLOCKER:CollisionFlag.WALL_NORTH;},findPathSteps:(request:any,opts:any)=>{
    routes++;assert.equal(request.worldViewId,4000);
    assert.equal(opts.routeStrategy.hasArrived(3168,4323,0),clear,"approach path uses the same three-tile LoS test");
    return {ok:false,steps:[]};
}};
const runtime:any={queueNpcInteraction:(e:any)=>{assert.equal(e.option,"quick-start");dispatches++;}};
const system:any=new PlayerInteractionSystem(repo,path,undefined,undefined,runtime);
// Avoid unrelated combat/follow cancellation internals; exercise the real passive
// start, route strategy, tick arrival, and script dispatch end to end.
system.replaceInteractionState=()=>{};
system.resolveRunMode=()=>false;
assert(system.startNpcInteraction(socket,npc,"quick-start").ok);
assert.equal(routes,0,"three tiles away must not path adjacent first");
system.updateNpcInteractions(1,()=>npc);assert.equal(dispatches,1);
system.updateNpcInteractions(2,()=>npc);assert.equal(dispatches,1,"only one dispatch");
player.tileY=4322;system.startNpcInteraction(socket,npc,"quick-start");system.updateNpcInteractions(3,()=>npc);
assert(routes>0);assert.equal(dispatches,1,"four tiles cannot dispatch");
player.tileY=4323;clear=false;system.startNpcInteraction(socket,npc,"quick-start");system.updateNpcInteractions(4,()=>npc);
assert.equal(dispatches,1,"blocked line of sight cannot dispatch");
clear=true;system.startNpcInteraction(socket,npc,"quick-start");npc.worldViewId=4001;system.updateNpcInteractions(5,()=>npc);
assert.equal(dispatches,1,"changing instance before dispatch invalidates the interaction");npc.worldViewId=4000;
path.getCollisionFlagAt=()=>0;
npc.passiveInteractionRange=1;assert(!system.passiveNpcStrategy(player,npc).hasArrived(player.tileX,player.tileY,0),"ordinary NPCs keep adjacency");
player.tileY=4325;assert(system.passiveNpcStrategy(player,npc).hasArrived(player.tileX,player.tileY,0));
console.log("Passive NPC reach: three-tile approach/dispatch, walls, range, instance changes and default adjacency passed");
