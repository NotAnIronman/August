import assert from "node:assert/strict";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";
import { ScriptScheduler } from "@server/game/systems/ScriptScheduler";
import { ZoneTriggerService } from "@server/game/scripts/ZoneTriggerService";
import { QueueTaskSet } from "@server/game/model/queue";
import { LockState } from "@server/game/model/LockState";
import { PlayerRaidState } from "@server/game/state/PlayerRaidState";
import { THEATRE_ROOMS } from "@server/content/modules/theatre-of-blood/rooms";
import { THEATRE_ARENAS, THEATRE_BARRIER_ID, MAIDEN_ADD_SPAWNS, NYLO_ADD_SPAWNS } from "@server/content/modules/theatre-of-blood/arenas";
import { registerTheatreArenas } from "@server/content/modules/theatre-of-blood/TheatreArenaController";
import { THEATRE_COMBAT_STATS, theatreHitpoints } from "@server/data/theatreCombatStats";

function fixture(index: number, preview = false) {
    let tick=1, nextNpc=100, saves=0;
    const room=THEATRE_ROOMS[index], arena=THEATRE_ARENAS[room.id];
    const npcs=new Map<number,any>(), spawns:any[]=[], moves:any[]=[], messages:string[]=[];
    const players:any[]=[], dialogs:any[]=[], options:any[]=[], items:number[]=[], bossEvents:any[]=[];
    let fullInventory=false, failSave=false;
    let killListener:((killer:any,npc:any)=>void)|undefined;
    const instance:any={id:"one",definitionId:preview?`theatre-preview:${index}`:`theatre-of-blood:run:${index}`,
        worldViewId:4000,memberPlayerIds:[],started:false};
    let exists=true, failSpawn=false, failAttach=false;
    let record:any={version:1,id:"run",access:"party",roster:["alice","bob"],roomIndex:index,completedRooms:index,started:false,instanceId:"one"};
    const services:any={
        system:{getCurrentTick:()=>tick,isDeveloper:()=>preview},
        variables:{sendVarbit(){}},viewport:{getViewportTrackerFrontUid:()=>1},
        instances:{get:(id:number)=>exists&&instance.memberPlayerIds.includes(id)?instance:undefined,
            getById:(id:string)=>exists&&id===instance.id?instance:undefined,
            getMemberPlayers:()=>players.filter(p=>instance.memberPlayerIds.includes(p.id)),
            attachNpc:(_id:string,npc:any)=>{if(failAttach)return false;for(const p of players)p.instanceNpcIds.add(npc.id);return true;},
            markStarted:()=>{instance.started=true;return true;},
            theatreRuns:{load:()=>structuredClone(record),save:(r:any)=>{if(failSave)throw new Error("save failed");saves++;record=structuredClone(r);}}},
        npc:{spawnNpc:(config:any)=>{if(failSpawn)return;spawns.push(config);const npc={...config,typeId:config.id,id:nextNpc++,tileX:config.x,tileY:config.y,
            hp:10,maxHp:10,size:config.id===8359?5:6,incomingPlayerDamageMultiplier:1,clearPath(){},setPath(){},
            getHitpoints(){return this.hp;},getMaxHitpoints(){return this.maxHp;},configureHitpoints(hp:number){this.hp=hp;this.maxHp=hp;},setUnattackable(v:boolean){this.isUnattackable=v;}};npcs.set(npc.id,npc);return npc;},
            removeNpc:(id:number)=>npcs.delete(id),queueNpcSeq(){},disengageCombat(){}},
        combat:{getNpc:(id:number)=>npcs.get(id),registerOnNpcKilled:(fn:any)=>{killListener=fn;return ()=>{killListener=undefined;};}},
        location:{replaceTemporaryLoc:(scope:any,oldId:number,newId:number,tile:any,level:number,options:any)=>({scope,oldId,newId,tile,level,...options}),clearTemporaryLoc:()=>true},
        messaging:{sendGameMessage:(_p:any,msg:string)=>messages.push(msg)},
        dialog:{queueWidgetEvent:(id:number,event:any)=>bossEvents.push({id,...event}),closeSubInterface(){},openSubInterface(){},queueClientScript(){},closeDialog:()=>{},openDialog:(_p:any,d:any)=>dialogs.push(d),openDialogOptions:(_p:any,o:any)=>options.push(o)},
        inventory:{collectCarriedItemIds:()=>items,addItemToInventory:(_p:any,id:number)=>{if(fullInventory)return {added:0};items.push(id);return {added:1};}},
        animation:{playPlayerSeq:()=>{}},
        movement:{getPathService:()=>undefined,teleportPlayer:(p:any,x:number,y:number,level:number)=>{
            assert.equal(p.raidProgress.isInternal,true,"arena traversal must bypass progress-loss confirmation");
            Object.assign(p,{tileX:x,tileY:y,level});
        },queueForcedMovement:(p:any,params:any)=>moves.push({id:p.id,...params})},
        sequence:{run:(p:any,generator:any,options:any)=>{
            const previous=p.lock;
            return p.taskQueue.queueStrong(function*(task:any){
                p.lock=options.lock;
                try{yield* generator(task);}finally{p.lock=previous;options.onCleanup?.();}
            });
        }},
    };
    function player(name:string) {
        const p:any={id:players.length+1,name,__saveKey:name,tileX:3677,tileY:3219,level:0,worldViewId:-1,
            instanceNpcIds:new Set(),raidProgress:new PlayerRaidState(),lock:LockState.NONE,skillSystem:{getSkill:()=>({baseLevel:99,boost:0})},
            canInteract(){return this.lock===LockState.NONE;},clearPendingSeqs(){},stopAnimation(){}};
        p.taskQueue=new QueueTaskSet(p);
        if(!preview)p.raidProgress.set({version:1,raid:"theatre-of-blood",runId:"run",completedRooms:Math.min(index,5),access:"party",roster:["alice","bob"],status:"active"});
        players.push(p);instance.memberPlayerIds.push(p.id);return p;
    }
    const registry=new ScriptRegistry(), scheduler=new ScriptScheduler();
    const controller=registerTheatreArenas(registry,services);
    const runtime=new ScriptRuntime({registry,scheduler,services,logger:{info(){},warn(){},error(){},debug(){}}});
    const zones=new ZoneTriggerService(runtime);
    const p=player("alice");
    function enter(target=p){
        zones.observeBeforeMovement(target);
        Object.assign(target,{tileX:room.entrance.x,tileY:room.entrance.y,level:room.entrance.level,worldViewId:4000});
        zones.processAfterMovement(target,tick);scheduler.process(tick);
    }
    function cycle(count=1){for(let i=0;i<count;i++){tick++;for(const target of players)target.taskQueue.cycle();}}
    function pass(gate=arena.gates[0],target=p,entering=true){
        const other=gate.axis==="x"?"y":"x";
        const tile:any={[gate.axis]:gate.coordinate,[other]:gate.min};
        Object.assign(target,{tileX:tile.x,tileY:tile.y});
        target[gate.axis==="x"?"tileX":"tileY"]-=gate.inward*(entering?1:-1);
        registry.findLocInteraction(THEATRE_BARRIER_ID,"pass")!({player:target,tile,locId:THEATRE_BARRIER_ID,level:room.entrance.level,action:"pass",tick,services});
    }
    function confirmVerzik(choice=0){dialogs.at(-1).onContinue();options.at(-1).onSelect(choice);}
    return {p,room,arena,services,registry,controller,npcs,spawns,moves,messages,player,enter,cycle,pass,instance,dialogs,options,items,bossEvents,confirmVerzik,
        fullInventory:(v:boolean)=>{fullInventory=v;},failSave:(v:boolean)=>{failSave=v;},
        saves:()=>saves,record:()=>record,dispose:()=>{exists=false;npcs.clear();controller.prune();},
        failSpawn:(v:boolean)=>{failSpawn=v;},failAttach:(v:boolean)=>{failAttach=v;},kill:(npc:any)=>{assert(killListener);killListener(p,npc);}};
}

for(let index=0;index<6;index++) {
    const f=fixture(index);f.enter();
    assert.equal(f.spawns.length,1,`${f.room.name}: zone arrival spawns a boss without clicking anything`);
    assert.deepEqual([f.spawns[0].id,f.spawns[0].x,f.spawns[0].y,f.spawns[0].level],
        [f.arena.boss.id,f.arena.boss.x,f.arena.boss.y,f.room.entrance.level]);
    assert.equal(f.spawns[0].worldViewId,4000);assert.equal(f.spawns[0].ownerPlayerId,undefined);
    assert.equal(f.spawns[0].respawns,false);assert.equal(f.npcs.values().next().value.suppressDrops,true);
    if(index===1) {
        assert.equal(f.spawns[0].isImmovable,false,"Bloat can follow his authored loop");
        assert.equal(f.npcs.values().next().value.scriptedMovement,true,"ordinary chase/overlap movement cannot hijack Bloat");
        for(const effect of ["freeze","bind","stun","knockback"])assert.equal(f.spawns[0].immunities[effect],true);
    }
    const bob=f.player("bob");f.enter(bob);assert.equal(f.spawns.length,1,"a party join must not duplicate the boss");
    if(index===5){
        f.cycle(6);
        assert.equal(f.p.lock,LockState.FULL,"Verzik's walk stays locked until all six ticks have elapsed");
        f.cycle(2);
        assert.deepEqual([f.p.tileX,f.p.tileY,bob.tileX,bob.tileY],[3168,4303,3168,4303]);
        assert.equal(f.moves.length,2);assert.equal(f.moves[0].endTick-f.moves[0].startTick,6);
        assert.equal(f.record().started,false,"Verzik must never auto-start on arrival");
        const npc=f.npcs.values().next().value;
        const talk=f.registry.findNpcInteraction(14795,"talk-to")!;
        talk({player:f.p,npc,services:f.services,tick:10});assert.equal(f.saves(),0,"remote Talk-to rejected");
        f.p.tileY=4322;
        talk({player:f.p,npc:{...npc,worldViewId:999},services:f.services,tick:10});assert.equal(f.saves(),0);
        talk({player:f.p,npc,services:f.services,tick:10});talk({player:f.p,npc,services:f.services,tick:10});
        assert.equal(f.saves(),0,"Talk-to alone does not start the encounter");
        f.confirmVerzik();f.options.at(-1).onSelect(0);
        assert.equal(f.npcs.size,1,"combat form replaces, rather than duplicates, the conversation form");
        assert.equal(f.npcs.values().next().value.typeId,8370);
    } else {
        f.pass();f.pass();f.pass(undefined,bob);f.cycle(1);
        assert.equal(f.p.canInteract(),false,"crossing locks competing movement");
        assert.equal(f.saves(),0,"the encounter starts after the walk, not at the initial click");
        f.cycle();
        assert.equal(f.saves(),0,"the queue's invocation tick must not shorten the crossing");
        assert.equal(f.p.lock,LockState.FULL);
        f.cycle(2);
        const gate=f.arena.gates[0];
        assert.equal(f.p[gate.axis==="x"?"tileX":"tileY"],gate.coordinate+gate.inward);
        assert.equal(f.moves.length,2,"double-clicking does not queue a second crossing");
        f.pass(undefined,f.p,false);f.cycle(3);
        assert.equal(f.moves.length,2,"uncleared rooms cannot be escaped by reversing Pass");
    }
    assert.equal(f.saves(),1,"party members start one durable encounter, idempotently");
    assert.equal(f.record().completedRooms,index,"entry never awards room completion");
    assert.equal(f.p.lock,LockState.NONE);
    const combatNpc=f.npcs.values().next().value;
    assert.equal(combatNpc.isUnattackable,false);
    assert.equal(combatNpc.maxHp,theatreHitpoints(THEATRE_COMBAT_STATS[combatNpc.typeId].hitpoints,2));
    assert.equal(f.registry.findNpcAttack(combatNpc.typeId)!({npc:combatNpc} as any),"prevent","prep does not invent boss attacks");
    assert.equal(f.registry.findNpcAttack(combatNpc.typeId)!({npc:{...combatNpc,worldViewId:-1}} as any),undefined,"overworld NPCs are unaffected");
    f.dispose();f.cycle(2);
}
{
    const f=fixture(0);f.failSpawn(true);f.enter();assert.equal(f.spawns.length,0);
    f.failSpawn(false);f.failAttach(true);f.controller.enter(f.p,0);assert.equal(f.npcs.size,0,"failed attachment removes the orphan NPC");
    f.failAttach(false);f.controller.enter(f.p,0);assert.equal(f.npcs.size,1);
    f.pass();f.cycle();f.dispose();f.cycle(4);
    assert.equal(f.saves(),0,"an abandoned instance cannot be started by a delayed arrival");
    assert.equal(f.p.lock,LockState.NONE);
}
{
    const f=fixture(0);f.enter();f.pass();
    f.p.taskQueue.terminateTasks();
    f.pass();f.cycle(4);
    assert.equal(f.moves.length,1,"cancelling before invocation must not permanently block Pass");
    assert.equal(f.saves(),1);
    // A reconnected party member has a fresh runtime player id but reuses the live room/boss.
    f.instance.memberPlayerIds=f.instance.memberPlayerIds.filter((id:number)=>id!==f.p.id);
    const reconnected=f.player("alice");f.enter(reconnected);f.pass(undefined,reconnected);f.cycle(4);
    assert.equal(f.spawns.length,1);assert.equal(f.saves(),1,"rejoining a running room must not restart it");
}
{
    const f=fixture(0);f.enter();f.pass();f.cycle();
    const boss=f.npcs.values().next().value;
    f.npcs.set(boss.id,{...boss});f.cycle(4);
    assert.equal(f.saves(),0,"recycled NPC ids cannot authorize a stale entry callback");
    assert.equal(f.p.lock,LockState.NONE);
}
{
    const f=fixture(0);
    Object.assign(f.p,{tileX:f.room.entrance.x,tileY:f.room.entrance.y,level:0});
    f.controller.enter(f.p,0);
    assert.equal(f.spawns.length,0,"overworld players never spawn private bosses");
    f.enter();
    f.p.worldViewId=999;f.pass();f.cycle(4);
    assert.equal(f.moves.length,0,"wrong-world-view clicks cannot cross a raid barrier");
}
{
    const f=fixture(4,true);f.enter();f.pass();f.cycle(4);
    f.pass(f.arena.gates[1],f.p,false);f.cycle(4);
    assert.equal(f.moves.length,2,"developers can cross the arena exit to continue previewing rooms");
    assert.equal(f.saves(),0);
}
{
    const f=fixture(5,true);f.enter();f.cycle(8);
    assert.equal(f.record().started,false);assert.equal(f.p.raidProgress.checkpoint,undefined);
    const npc=f.npcs.values().next().value;f.p.tileY=4322;
    f.registry.findNpcInteraction(14795,"talk-to")!({player:f.p,npc,services:f.services,tick:10});
    f.confirmVerzik();
    assert.equal(f.saves(),0,"development preview never writes raid progress");
}
{
    const f=fixture(5);f.enter();f.cycle(8);f.p.tileY=4322;
    const npc=f.npcs.values().next().value;
    const talk=()=>f.registry.findNpcInteraction(14795,"talk-to")!({player:f.p,npc,services:f.services,tick:10});
    talk();f.confirmVerzik(1);assert.equal(f.saves(),0,"Not yet leaves the room waiting");
    talk();f.dialogs.at(-1).onContinue();f.p.tileY=4303;f.options.at(-1).onSelect(0);
    assert.equal(f.saves(),0,"walking away invalidates readiness");
    f.p.tileY=4322;talk();f.failSpawn(true);f.confirmVerzik();
    assert.equal(f.npcs.get(npc.id),npc,"failed combat spawn preserves the talk NPC");
    assert.equal(f.saves(),0);f.failSpawn(false);
    talk();f.failSave(true);assert.throws(()=>f.confirmVerzik(),/save failed/);
    assert.equal(f.npcs.size,1,"failed save removes the staged combat form");
    assert.equal(f.npcs.get(npc.id),npc);
    f.failSave(false);talk();f.confirmVerzik();assert.equal(f.saves(),1);
}
{
    const f=fixture(0);f.enter();
    f.record().roster.push("charlie","dave");f.pass();f.cycle(4);
    const boss=f.npcs.values().next().value;
    assert.equal(boss.maxHp,3062,"four-player scale is frozen at start (rounded down)");
    boss.hp-=100;
    const bob=f.player("bob");f.enter(bob);f.pass(undefined,bob);f.cycle(4);
    assert.equal(boss.hp,2962,"reconnect cannot heal an existing boss");
}
{
    const f=fixture(4);f.enter();
    const search=(tile={x:3171,y:4397},level=1)=>f.registry.findLocInteraction(32741,"search")!({player:f.p,tile,level,locId:32741,action:"search",tick:1,services:f.services});
    search();assert.equal(f.items.length,0,"remote searches cannot grant items");
    Object.assign(f.p,{tileX:3170,tileY:4397});
    f.fullInventory(true);search();assert.equal(f.items.length,0);
    f.fullInventory(false);search({x:3170,y:4397});search(undefined,0);assert.equal(f.items.length,0);
    search();search();assert.deepEqual(f.items,[22516],"one carried Dawnbringer, including repeat clicks");
    f.items.length=0;f.p.worldViewId=-1;search();assert.equal(f.items.length,0);
}
assert.deepEqual([1,2,3,4,5].map(n=>theatreHitpoints(2000,n)),[1500,1500,1500,1750,2000]);
{
    const f=fixture(5);f.enter();f.cycle(8);const npc=f.npcs.values().next().value;
    assert.equal(npc.passiveInteractionRange,3);
    const event={player:f.p,npc,services:f.services,tick:10};
    const talk=f.registry.findNpcInteraction(14795,"talk-to")!,quick=f.registry.findNpcInteraction(14795,"quick-start")!;
    f.p.tileY=4321;talk(event);quick(event);assert.equal(f.dialogs.length,0);assert.equal(f.saves(),0,"four tiles is too far");
    f.p.tileY=4322;talk(event);assert.equal(f.dialogs.length,1,"Talk-to works at exactly three tiles");
    const stale=f.dialogs[0];
    f.failSpawn(true);quick(event);assert.equal(f.saves(),0);assert.equal(f.npcs.get(npc.id),npc);
    f.failSpawn(false);quick(event);quick(event);stale.onContinue();
    assert.equal(f.saves(),1);assert.equal(f.dialogs.length,1);assert.equal(f.options.length,0,"quick-start skips both dialogue and readiness menu");
    const boss=f.npcs.values().next().value;assert.equal(boss.typeId,8370);assert.equal(boss.isUnattackable,false);assert.equal(boss.direction,1);
}
{
    const f=fixture(5);f.enter();f.cycle(8);f.p.tileY=4322;const npc=f.npcs.values().next().value;
    f.controller.talk({player:f.p,npc,services:f.services,tick:10});f.confirmVerzik();assert.equal(f.saves(),1,"dialogue confirmation also accepts three tiles");
}
for(let index=0;index<6;index++) {
    const f=fixture(index);let stairs=0;
    f.controller.vault.unlock=()=>{stairs++;};f.enter();
    if(index===5){f.cycle(8);f.p.tileY=4322;const npc=f.npcs.values().next().value;f.controller.talk({player:f.p,npc,services:f.services,tick:10});f.confirmVerzik();}
    else{f.pass();f.cycle(4);}
    const boss=f.npcs.values().next().value;
    f.controller.killed(f.p,boss);assert.equal(f.record().completedRooms,index,"living boss cannot complete a raid");
    boss.hp=0;f.controller.killed(f.p,{...boss});assert.equal(f.record().completedRooms,index,"forged/recycled NPC identity rejected");
    f.failSave(true);assert.throws(()=>f.controller.killed(f.p,boss),/save failed/);
    assert.equal(f.record().completedRooms,index);assert.equal(stairs,0);
    f.failSave(false);f.kill(boss);f.kill(boss);
    assert.equal(f.record().completedRooms,index+1);assert.equal(stairs,index===5?1:0);
    assert.equal(!!f.record().rewards,index===5,"only terminal room rolls rewards");
    f.npcs.delete(boss.id);f.controller.enter(f.p,index);assert.equal(f.npcs.size,0,"completed boss stays dead");
}
assert.deepEqual(MAIDEN_ADD_SPAWNS.left.map(p=>[p.x,p.y]),[[3175,4435],[3179,4435],[3183,4435],[3187,4435]]);
assert.deepEqual(MAIDEN_ADD_SPAWNS.right.map(p=>[p.x,p.y]),[[3175,4457],[3179,4457],[3183,4457],[3187,4457]]);
assert.deepEqual(NYLO_ADD_SPAWNS,{left:{x:3311,y:4249},middle:{x:3295,y:4233},right:{x:3280,y:4249}});
{
    const f=fixture(0,true);f.enter();f.controller.prune();
    const boss:any=[...f.npcs.values()][0];
    assert.equal(f.bossEvents.at(-1).active,true,"boss HUD appears at room entry");
    assert.equal(f.bossEvents.at(-1).maximum,boss.getMaxHitpoints());
    assert.deepEqual(f.bossEvents.at(-1).markers.map((m:any)=>m.percent),[70,50,30]);
    const count=f.bossEvents.length;f.controller.prune();assert.equal(f.bossEvents.length,count,"unchanged HP does not spam packets");
    boss.hp-=10;boss.presentationTypeId=8361;f.controller.prune();
    assert.equal(f.bossEvents.at(-1).current,boss.hp,"phase changes retain live boss health");
    const q=f.player("bob");f.enter(q);f.controller.prune();assert.equal(f.bossEvents.at(-1).id,q.id,"late joiner receives boss HUD");
    q.worldViewId=-1;f.controller.prune();assert.equal(f.bossEvents.at(-1).active,false,"leaving closes HUD");
    boss.hp=0;f.controller.prune();assert.equal(f.bossEvents.at(-1).active,false,"death closes HUD");
}
console.log("Theatre arena entry: all bosses, party isolation/idempotency, forced walks, Verzik Talk-to, cleanup, live boss HUD and preview safety passed");
