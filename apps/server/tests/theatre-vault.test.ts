import assert from "node:assert/strict";
import { REWARD_DISPLAY_PANEL_GROUP_ID as REWARD_GROUP } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { TheatreVaultController } from "@server/content/modules/theatre-of-blood/TheatreVaultController";
import { TheatreRuns,sanitizeTheatreRun } from "@server/content/modules/theatre-of-blood/TheatreRun";
import { VAULT_CHESTS,VERZIK_STAIRS_TILE,VAULT_CRYSTAL_TILE,chestId } from "@server/content/modules/theatre-of-blood/vault";
import { THEATRE_COMMONS,THEATRE_UNIQUES,rollTheatreRewards } from "@server/content/modules/theatre-of-blood/rewards";
import { PlayerInventoryState } from "@server/game/state/PlayerInventoryState";
import { PlayerRaidState } from "@server/game/state/PlayerRaidState";
import { PlayerCollectionLogState } from "@server/game/state/PlayerCollectionLogState";
import { PlayerFollowerPersistState } from "@server/game/state/PlayerFollowerPersistState";

assert.equal(THEATRE_COMMONS.reduce((n,r)=>n+r[3],0),30);
assert.equal(THEATRE_UNIQUES.reduce((n,r)=>n+r[1],0),19);
for(let size=1;size<=5;size++) {
 const ordinary=rollTheatreRewards(size,()=>0.99),purple=rollTheatreRewards(size,()=>0);
 assert.equal(purple.filter(r=>r.unique).length,1);assert.equal(purple[0].items[0].itemId,22477);
 assert(ordinary.every(r=>!r.unique && !r.pet && r.items.length===1 && r.items[0].quantity===36),"three identical common rolls merge");
 assert.equal(purple[0].pet,true);assert(purple[0].items.some(i=>i.itemId===12073));
}
assert.deepEqual([chestId(true,false,false),chestId(true,true,false),chestId(false,false,false),chestId(false,true,false),chestId(true,false,true),chestId(false,true,true)],[32992,32993,32990,32991,32994,41746]);

function fixture(size=2,preview=false) {
 let record:any={version:1,id:"test",access:size===1?"solo":"party",roster:Array.from({length:size},(_,i)=>`player${i}`),roomIndex:5,completedRooms:6,started:true,instanceId:"boss",rewards:rollTheatreRewards(size,()=>0.99)};
 let failClaim=false,claims=0,next=0;
 const players:any[]=[],instances=new Map<string,any>(),locs=new Map<string,any>(),messages:string[]=[];
 const boss={id:"boss",definitionId:preview?"theatre-preview:5":"theatre-of-blood:test:5",worldViewId:4000,memberPlayerIds:[] as number[]};instances.set("boss",boss);
 const key=(scope:any,tile:any)=>`${scope.worldViewId}:${scope.ownerPlayerId??"*"}:${tile.x}:${tile.y}`;
 const current=(p:any)=>[...instances.values()].find(i=>i.memberPlayerIds.includes(p.id));
 function depart(p:any){const i=current(p);if(i){i.memberPlayerIds=i.memberPlayerIds.filter((id:number)=>id!==p.id);if(!i.memberPlayerIds.length)instances.delete(i.id);}}
 const store={load:()=>structuredClone(record),save:(r:any)=>{record=structuredClone(r);},claim:(r:any,p:any)=>{
    if(failClaim)throw new Error("disk full");assert(!record.rewards[record.roster.indexOf(p.name)].claimed);record=structuredClone(r);claims++;
 }};
 const services:any={instances:{theatreRuns:store,get:(id:number)=>current({id}),getById:(id:string)=>instances.get(id),
    getMemberPlayers:(id:string)=>players.filter(p=>instances.get(id)?.memberPlayerIds.includes(p.id)),buildTemplate:(copies:any)=>copies,
    create:(p:any,spec:any)=>{assert(!p.raidProgress.checkpoint||p.raidProgress.isInternal);depart(p);const i={id:`vault${++next}`,worldViewId:4100+next,definitionId:spec.definitionId,memberPlayerIds:[p.id]};instances.set(i.id,i);Object.assign(p,{worldViewId:i.worldViewId,tileX:spec.destination.x,tileY:spec.destination.y,level:0});return i;},
    join:(p:any,id:string)=>{assert(p.raidProgress.isInternal);const i=instances.get(id);if(!i)return;depart(p);i.memberPlayerIds.push(p.id);Object.assign(p,{worldViewId:i.worldViewId,tileX:3237,tileY:4307,level:0});return i;},
    leave:(p:any,t:any)=>{depart(p);Object.assign(p,{worldViewId:-1,tileX:t.x,tileY:t.y});return true;}},
    location:{replaceTemporaryLoc:(scope:any,oldId:number,newId:number,tile:any,level:number,options:any)=>{
        const change={scope,oldId,newId,tile,level,...options};locs.set(key(scope,tile),change);return change;},
        clearTemporaryLoc:(scope:any,_id:number,tile:any)=>locs.delete(key(scope,tile)),
        hasTemporaryLocVisibleToPlayer:(p:any,id:number,tile:any)=>{
            const l=locs.get(key({worldViewId:p.worldViewId,ownerPlayerId:p.id},tile))??locs.get(key({worldViewId:p.worldViewId},tile));return l?.newId===id;},
        isAdjacentToLoc:(p:any,_id:number,t:any)=>Math.abs(p.tileX-t.x)<=1&&Math.abs(p.tileY-t.y)<=1},
    inventory:{findOwnedItemLocation:(p:any,id:number)=>p.items.getInventoryEntries().some((i:any)=>i.itemId===id)?{}:undefined,snapshotInventory:()=>{}},
    collectionLog:{sendCollectionLogSnapshot:()=>{}},data:{getObjType:()=>undefined},system:{isDeveloper:()=>preview,logger:{error(){}}},
    dialog:{openDialogOptions:()=>{throw new Error("Theatre rewards must not use chat dialogs");},
        queueWidgetEvent:()=>{},closeModal:(p:any)=>{p.modal=undefined;},
        getInterfaceService:()=>({openModal:(p:any,id:number)=>{p.modal=id;},isModalOpen:(p:any,id:number)=>p.modal===id})},
    banking:{addItemToBank:(p:any,id:number,qty:number)=>{p.items.bank.push({itemId:id,quantity:qty});return true;}},
    messaging:{sendGameMessage:(_p:any,m:string)=>messages.push(m)}};
 for(let i=0;i<size;i++) {
    const p:any={id:i+1,name:`player${i}`,__saveKey:`player${i}`,worldViewId:4000,tileX:3168,tileY:4322,level:0,
        raidProgress:new PlayerRaidState(),items:new PlayerInventoryState(),collectionLog:new PlayerCollectionLogState(),followers:new PlayerFollowerPersistState(),canInteract:()=>true};
    p.items.setItemDefResolver(()=>({stackable:true}));p.raidProgress.set({version:1,raid:"theatre-of-blood",runId:"test",completedRooms:5,access:record.access,roster:record.roster,status:"active"});
    if(preview)p.raidProgress.clear();
    players.push(p);boss.memberPlayerIds.push(p.id);
 }
 const controller=new TheatreVaultController(services,()=>preview),registry=new ScriptRegistry();controller.register(registry);
 const event=(p:any,id:number,tile:any,action:string)=>({player:p,locId:id,tile,action,level:0,services,tick:1});
 const enter=(p:any)=>{Object.assign(p,{tileX:3168,tileY:4322});controller.stairs(event(p,32995,VERZIK_STAIRS_TILE,"climb"));};
 const click=(p:any,child=852,opId=1)=>registry.findWidgetAction((REWARD_GROUP<<16)|child,opId)?.({player:p,services,groupId:REWARD_GROUP,widgetId:(REWARD_GROUP<<16)|child,opId,tick:1} as any);
 const open=(p:any,index=players.indexOf(p),id=32992)=>{const t=VAULT_CHESTS[index];Object.assign(p,{tileX:t.x,tileY:t.y-1});controller.open(event(p,id,t,"open"));click(p);};
 return {controller,players,services,registry,locs,current,record:()=>record,setRecord:(r:any)=>record=r,failClaim:(v:boolean)=>failClaim=v,claims:()=>claims,messages,event,enter,open,click};
}
for(let size=1;size<=5;size++) {
 const f=fixture(size),a=f.players[0];
 f.enter(a);assert.equal(a.worldViewId,4000,"stairs cannot be forged before they spawn");
 f.controller.unlock("boss");
 a.tileY=4321;f.controller.stairs(f.event(a,32995,VERZIK_STAIRS_TILE,"climb"));
 assert.equal(a.worldViewId,4000,"stairs cannot be used from four tiles away");
 for(const p of f.players)f.enter(p);
 assert.equal(new Set(f.players.map(p=>p.worldViewId)).size,1);
 assert.equal(f.locs.size,1+size*2,"exactly one shared form and one owner override per occupied chest");
 for(let i=0;i<size;i++)assert(f.services.location.hasTemporaryLocVisibleToPlayer(f.players[i],32992,VAULT_CHESTS[i]));
 if(size>1){f.open(a,1);assert.equal(f.claims(),0,"teammates cannot claim another player's chest even with forged own ID");}
 f.open(a,0,32993);assert.equal(f.claims(),0,"wrong unique model rejected");
 const checkpoint=a.raidProgress.checkpoint;a.raidProgress.clear();f.open(a);assert.equal(f.claims(),0,"abandoned raid cannot be looted");a.raidProgress.set(checkpoint);
 f.failClaim(true);f.open(a);assert.equal(f.claims(),0);assert(a.items.getInventoryEntries().every((i:any)=>i.itemId<0));assert.equal(a.collectionLog.getCategoryStat(506),undefined);
 f.failClaim(false);a.items.inventory=Array.from({length:28},()=>({itemId:995,quantity:1}));f.open(a);assert.equal(f.claims(),0);assert(!f.record().rewards[0].claimed);
 a.items.inventory=Array.from({length:28},()=>({itemId:-1,quantity:0}));f.open(a);assert.equal(f.claims(),1);assert(f.record().rewards[0].claimed);
 assert.equal(a.items.getInventoryEntries().find((i:any)=>i.itemId===21488).quantity,36);
 f.open(a,0,32994);assert.equal(f.claims(),1,"opened chest cannot pay twice");
 assert(f.services.location.hasTemporaryLocVisibleToPlayer(a,32994,VAULT_CHESTS[0]));
 if(size>1)assert(f.services.location.hasTemporaryLocVisibleToPlayer(f.players[1],32994,VAULT_CHESTS[0]));
 Object.assign(a,{tileX:VAULT_CRYSTAL_TILE.x,tileY:VAULT_CRYSTAL_TILE.y-1});f.controller.exit(f.event(a,32996,VAULT_CRYSTAL_TILE,"use"));
 assert.deepEqual([a.tileX,a.tileY],[3677,3219]);assert(!a.raidProgress.checkpoint);
 f.controller.prune(true);assert.equal(f.locs.size,0,"module cleanup removes owned and shared overrides");
}
{
 const f=fixture(1),a=f.players[0];const r=f.record();r.rewards=rollTheatreRewards(1,()=>0);f.setRecord(r);
 f.controller.unlock("boss");f.enter(a);f.open(a,0,32993);assert.equal(f.claims(),1);
 assert.equal(a.followers.getPendingRewards()[0].itemId,22473);assert.equal(a.followers.getFirstPetDrop(22473).killcount,1);
 assert.equal(a.collectionLog.getItemCount(22473),1);assert(f.services.location.hasTemporaryLocVisibleToPlayer(a,41746,VAULT_CHESTS[0]));
 const saved=structuredClone(f.record());assert(sanitizeTheatreRun(saved));saved.rewards[0].items[0].itemId=995;assert(!sanitizeTheatreRun(saved));
}
console.log("Vault: party sizes, private chest options, atomic rollback, full bags, uniques/pets, duplicate claims, exit and cleanup passed");
{
 const f=fixture(1),p=f.players[0],r=f.record();
 r.rewards=[{unique:false,claimed:false,pet:false,items:[{itemId:565,quantity:1500},{itemId:22447,quantity:60}]}];f.setRecord(r);
 f.controller.unlock("boss");f.enter(p);
 p.items.inventory=Array.from({length:28},(_,i)=>({itemId:i===27?-1:995,quantity:i===27?0:1}));
 f.open(p);
 assert.deepEqual(f.record().rewards[0].received,[1500,0]);
 assert(!f.record().rewards[0].claimed);assert.equal(p.collectionLog.getCategoryStat(506).count1,1);
 const retry=(_choice:number)=>f.click(p,854);
 f.failClaim(true);retry(1);assert.equal(p.items.bank.length,0,"failed save restores bank too");
 assert.deepEqual(f.record().rewards[0].received,[1500,0]);
 f.failClaim(false);retry(1);
 assert.equal(p.items.bank[0].quantity,60);assert(f.record().rewards[0].claimed);
 assert.equal(p.collectionLog.getCategoryStat(506).count1,1,"partial claims award KC once");
 retry(1);assert.equal(p.items.bank[0].quantity,60,"replayed menu cannot duplicate loot");
}
{
 const f=fixture(1,true),a=f.players[0];f.controller.unlock("boss");f.enter(a);f.open(a);
 assert(f.current(a).definitionId.startsWith("theatre-vault-preview:"));assert.equal(f.claims(),0);
 assert(a.items.getInventoryEntries().every((i:any)=>i.itemId<0));assert.equal(a.collectionLog.getCategoryStat(506),undefined);
 assert(f.services.location.hasTemporaryLocVisibleToPlayer(a,32994,VAULT_CHESTS[0]));
}
{
 const f=fixture(1),a=f.players[0];f.controller.unlock("boss");f.enter(a);
 let confirm=()=>{};a.raidProgress.confirm=(_action:any,cb:any)=>{confirm=cb;};
 Object.assign(a,{tileX:VAULT_CRYSTAL_TILE.x,tileY:VAULT_CRYSTAL_TILE.y-1});
 f.controller.exit(f.event(a,32996,VAULT_CRYSTAL_TILE,"use"));assert(f.current(a),"unclaimed exit needs confirmation");
 confirm();assert(!f.current(a));assert(!a.raidProgress.checkpoint);assert.equal(f.claims(),0);
}
