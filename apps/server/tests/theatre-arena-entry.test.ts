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

function fixture(index: number, preview = false) {
    let tick=1, nextNpc=100, saves=0;
    const room=THEATRE_ROOMS[index], arena=THEATRE_ARENAS[room.id];
    const npcs=new Map<number,any>(), spawns:any[]=[], moves:any[]=[], messages:string[]=[];
    const players:any[]=[];
    const instance:any={id:"one",definitionId:preview?`theatre-preview:${index}`:`theatre-of-blood:run:${index}`,
        worldViewId:4000,memberPlayerIds:[],started:false};
    let exists=true, failSpawn=false, failAttach=false;
    let record:any={version:1,id:"run",access:"party",roster:["alice","bob"],roomIndex:index,completedRooms:index,started:false,instanceId:"one"};
    const services:any={
        system:{getCurrentTick:()=>tick,isDeveloper:()=>preview},
        instances:{get:(id:number)=>exists&&instance.memberPlayerIds.includes(id)?instance:undefined,
            getById:(id:string)=>exists&&id===instance.id?instance:undefined,
            getMemberPlayers:()=>players.filter(p=>instance.memberPlayerIds.includes(p.id)),
            attachNpc:(_id:string,npc:any)=>{if(failAttach)return false;for(const p of players)p.instanceNpcIds.add(npc.id);return true;},
            markStarted:()=>{instance.started=true;return true;},
            theatreRuns:{load:()=>structuredClone(record),save:(r:any)=>{saves++;record=structuredClone(r);}}},
        npc:{spawnNpc:(config:any)=>{if(failSpawn)return;spawns.push(config);const npc={...config,typeId:config.id,id:nextNpc++,tileX:config.x,tileY:config.y};npcs.set(npc.id,npc);return npc;},
            removeNpc:(id:number)=>npcs.delete(id)},
        combat:{getNpc:(id:number)=>npcs.get(id)},
        messaging:{sendGameMessage:(_p:any,msg:string)=>messages.push(msg)},
        animation:{playPlayerSeq:()=>{}},
        movement:{teleportPlayer:(p:any,x:number,y:number,level:number)=>{
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
            instanceNpcIds:new Set(),raidProgress:new PlayerRaidState(),lock:LockState.NONE,
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
    return {p,room,arena,services,registry,controller,npcs,spawns,moves,messages,player,enter,cycle,pass,instance,
        saves:()=>saves,record:()=>record,dispose:()=>{exists=false;npcs.clear();controller.prune();},
        failSpawn:(v:boolean)=>{failSpawn=v;},failAttach:(v:boolean)=>{failAttach=v;}};
}

for(let index=0;index<6;index++) {
    const f=fixture(index);f.enter();
    assert.equal(f.spawns.length,1,`${f.room.name}: zone arrival spawns a boss without clicking anything`);
    assert.deepEqual([f.spawns[0].id,f.spawns[0].x,f.spawns[0].y,f.spawns[0].level],
        [f.arena.boss.id,f.arena.boss.x,f.arena.boss.y,f.room.entrance.level]);
    assert.equal(f.spawns[0].worldViewId,4000);assert.equal(f.spawns[0].ownerPlayerId,undefined);
    assert.equal(f.spawns[0].respawns,false);assert.equal(f.npcs.values().next().value.suppressDrops,true);
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
        f.p.tileY=4320;
        talk({player:f.p,npc:{...npc,worldViewId:999},services:f.services,tick:10});assert.equal(f.saves(),0);
        talk({player:f.p,npc,services:f.services,tick:10});talk({player:f.p,npc,services:f.services,tick:10});
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
    const npc=f.npcs.values().next().value;f.p.tileY=4320;
    f.registry.findNpcInteraction(14795,"talk-to")!({player:f.p,npc,services:f.services,tick:10});
    assert.equal(f.saves(),0,"development preview never writes raid progress");
}
assert.deepEqual(MAIDEN_ADD_SPAWNS.left.map(p=>[p.x,p.y]),[[3175,4435],[3179,4435],[3183,4435],[3187,4435]]);
assert.deepEqual(MAIDEN_ADD_SPAWNS.right.map(p=>[p.x,p.y]),[[3175,4457],[3179,4457],[3183,4457],[3187,4457]]);
assert.deepEqual(NYLO_ADD_SPAWNS,{left:{x:3311,y:4249},middle:{x:3295,y:4233},right:{x:3280,y:4249}});
console.log("Theatre arena entry: all bosses, party isolation/idempotency, forced walks, Verzik Talk-to, cleanup and preview safety passed");
