import assert from "node:assert/strict";
import { register } from "@server/content/modules/araxxor-instance";
import { NpcPreDeathDecision } from "@server/game/scripts/types";
import { DamageType } from "@server/game/combat/DamageTracker";
const handlers=new Map<string,(event:any)=>unknown>(), cleanup:Array<()=>void>=[];
let death:(event:any)=>unknown=()=>{};
const registry={registerCleanup:(fn:()=>void)=>cleanup.push(fn),registerLocInteraction(){},registerNpcAttack(){},
    registerNpcPreDeath:(_id:number,fn:(event:any)=>unknown)=>{death=fn;},
    registerNpcScript:(s:any)=>handlers.set(s.option,s.handler)};
const players=[1,2].map(id=>({id,name:`player${id}`,worldViewId:7,level:0,kc:0,
    collectionLog:{hasItem:()=>true,incrementCategoryStat:()=>{players[id-1].kc++;},getCategoryStat:()=>({count1:players[id-1].kc})}}));
const instance={id:"party",definitionId:"araxxor-lair",access:"party",memberPlayerIds:[1,2]};
const live=new Set([10]), claims:number[]=[], logged:number[]=[];
let corpse:any, rolled:number[]=[];
const boss={id:10,typeId:13668,tileX:3630,tileY:9813,level:0,worldViewId:7,getMaxHitpoints:()=>1000};
const services:any={system:{getCurrentTick:()=>0},encounters:{ensure:()=>undefined,getByNpcRuntimeId:()=>undefined},
    instances:{get:()=>instance,getMemberPlayers:()=>players,attachNpc:()=>true},
    npc:{spawnNpc:(config:any)=>{corpse={...config,typeId:config.id,id:11,tileX:config.x,tileY:config.y,setUnattackable(){}};live.add(11);return corpse;},
        removeNpc:(id:number)=>live.delete(id),disengageCombat(){},stopNpcMovement(){},queueNpcSeq(){}},
    combat:{getNpc:()=>undefined,getDropEligibility:()=>({primaryLooter:players[0],eligibleLooters:[players[0]],totalDamage:990,
        damageSummaries:players.map((player,i)=>({player,playerId:player.id,totalDamage:i===0?700:290,
            damageByType:new Map([[DamageType.Melee,i===0?700:290]]),hitCount:1,firstHitTick:0,lastHitTick:1}))}),
        rollNpcDrops:(_npc:any,eligible:any)=>{rolled=eligible.eligibleLooters.map((p:any)=>p.id);return rolled.map(ownerId=>({itemId:29806,quantity:1,ownerId,tile:{x:3630,y:9813,level:0}}));}},
    groundItems:{spawn:(_id:number,_qty:number,_tile:any,options:any)=>claims.push(options.ownerId)},
    collectionLog:{trackCollectionLogItem:(p:any)=>logged.push(p.id)},variables:{queueVarp(){}},messaging:{sendGameMessage(){}},scheduler:{after(){}}};
register(registry as never,services);
try {
    assert.equal(death({npc:boss,killer:players[1],tick:10,hit:{proposedDamage:99,hitpointsBefore:10},services}),NpcPreDeathDecision.Prevent);
    assert.deepEqual(rolled,[1,2],"second player qualifies with the capped lethal hit");
    assert.deepEqual(players.map(p=>p.kc),[1,1]);
    const harvest=handlers.get("harvest")!;
    harvest({npc:corpse,player:players[0],services});
    assert(live.has(11),"first harvest leaves the corpse for the teammate");
    harvest({npc:corpse,player:players[0],services});
    assert.deepEqual(claims,[1],"duplicate harvest cannot claim twice");
    players[1].worldViewId=8;
    harvest({npc:corpse,player:players[1],services});
    assert.deepEqual(claims,[1],"different instances cannot claim");
    players[1].worldViewId=7;
    harvest({npc:corpse,player:players[1],services});
    assert.deepEqual(claims,[1,2]); assert.deepEqual(logged,[1,2]);
    assert(!live.has(11),"corpse finishes after both independent claims");
} finally {cleanup.forEach(fn=>fn());}
console.log("Araxxor independent party loot, lethal threshold, duplicate/cross-instance protection and collection log passed");
