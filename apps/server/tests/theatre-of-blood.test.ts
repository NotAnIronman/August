import assert from "node:assert/strict";
import type { PlayerState } from "@server/game/player";
import { PlayerRaidState, type RaidCheckpoint } from "@server/game/state/PlayerRaidState";
import { InstancedAreaManager, buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { TheatreRuns, type TheatreRunRecord } from "@server/content/modules/theatre-of-blood/TheatreRun";
import { THEATRE_ROOMS, THEATRE_OUTSIDE, theatreRoomGeometry } from "@server/content/modules/theatre-of-blood/rooms";
import { mergePlayerPersistentVars } from "@server/game/state/PlayerPersistence";
import { unpackTemplateChunk } from "@august/game-model/world/instance/InstanceTypes";
import { MovementService } from "@server/game/services/MovementService";
import { decodeServerPacket } from "@client/core/network/packet/ServerBinaryDecoder";

// Use the real instance lifecycle, not a second implementation of party joins.
const players = new Map<number,PlayerState>();
const records = new Map<string,TheatreRunRecord>();
let nextPlayer = 1;
let collisionAvailable = true;
const svc: any = {
    mapService:{buildInstanceCollision:()=>collisionAvailable ? [] : undefined},
    pathService:{registerWorldViewCollision:()=>{},removeWorldViewCollision:()=>{}},
    npcManager:{spawnTransientNpc:()=>{throw new Error("Foundation must not spawn fake bosses");},removeNpc:()=>true},
    scriptScheduler:{cancelOwner:()=>{}},groundItems:{removeByWorldView:()=>{}},locationService:{},
    players:{getById:(id:number)=>players.get(id)},
    movementService:{
        teleportToInstance:(p:PlayerState,x:number,y:number,level:number)=>Object.assign(p,{tileX:x,tileY:y,level}),
        teleportPlayer:(p:PlayerState,x:number,y:number,level:number)=>Object.assign(p,{tileX:x,tileY:y,level}),
    },
};
const manager = new InstancedAreaManager(svc);
const instances: any = {
    buildTemplate:buildInstanceTemplate,
    create:manager.create.bind(manager),join:manager.join.bind(manager),leave:manager.leave.bind(manager),
    get:manager.get.bind(manager),getById:manager.getById.bind(manager),
    getMemberPlayers:manager.getMemberPlayers.bind(manager),markStarted:manager.markStarted.bind(manager),
};
const store = {load:(id:string)=>structuredClone(records.get(id)),save:(r:TheatreRunRecord)=>{records.set(r.id,structuredClone(r));}};
let runs = new TheatreRuns(instances,store);
function player(name:string):PlayerState {
    const p = {id:nextPlayer++,name,__saveKey:name,worldViewId:-1,level:0,tileX:3677,tileY:3219,
        instanceNpcIds:new Set<number>(),raidProgress:new PlayerRaidState()} as PlayerState;
    players.set(p.id,p);
    return p;
}
function disconnect(p:PlayerState):PlayerState {
    p.raidProgress.disconnected();
    const saved = p.raidProgress.serialize();
    p.raidProgress.internally(()=>manager.dispose(p));
    players.delete(p.id);
    const next = player(p.name);
    next.raidProgress.deserialize(saved);
    return next;
}
for (let i=0;i<6;i++) {
    const g = theatreRoomGeometry(i);
    assert.deepEqual(g.bounds,{minX:g.room.minX-4,maxX:g.room.maxX+4,minY:g.room.minY-4,maxY:g.room.maxY+4});
    const chunks = buildInstanceTemplate([g.copy]);
    for (let plane=0;plane<4;plane++) for (let x=g.bounds.minX;x<=g.bounds.maxX;x++) for(let y=g.bounds.minY;y<=g.bounds.maxY;y++) {
        const packed = chunks[plane][(x-g.sceneBase.x)>>3][(y-g.sceneBase.y)>>3];
        assert.notEqual(packed,-1,"every padded tile must be included");
        const chunk = unpackTemplateChunk(packed);
        assert.equal(chunk.plane,plane,"copy supporting terrain, bridges and roofs without changing their planes");
        assert.equal(chunk.chunkX,x>>3); assert.equal(chunk.chunkY,y>>3);
    }
    const packets:any[]=[];
    const movement = new MovementService({
        players:{getSocketByPlayerId:()=>({})},npcSyncSessions:new Map(),pendingNpcPackets:new Map(),
        instancedAreaManager:{get:()=>({baseX:g.sceneBase.x,baseY:g.sceneBase.y})},
        cacheEnv:{xteas:new Map()},locationService:{replayTemporaryLocsForPlayer:()=>{}},
        networkLayer:{withDirectSendBypass:(_type:string,fn:()=>void)=>fn(),
            sendWithGuard:(_ws:unknown,packet:Uint8Array)=>packets.push(decodeServerPacket(packet))},
    } as any);
    movement.teleportPlayer=()=>{};
    movement.teleportToInstance({id:1,visibleNpcIds:new Set(),lastNpcHealthBarScaled:new Map()} as any,
        g.room.entrance.x,g.room.entrance.y,g.room.entrance.level,chunks);
    assert.equal(packets[0].type,"rebuild_region");
    assert.equal((packets[0].payload.regionX-6)*8,g.sceneBase.x);
    assert.equal((packets[0].payload.regionY-6)*8,g.sceneBase.y);
    assert.deepEqual(packets[0].payload.templateChunks,chunks,"wire packet must preserve every copied chunk");
}
const a = player("alice");
let b = player("bob");
const other = player("other");
assert(runs.create(a,"party"));
assert.deepEqual(a.raidProgress.recoveryLocation,THEATRE_OUTSIDE);
const first = manager.get(a.id)!;
assert(runs.join(b,first.id));
assert(runs.create(other,"solo"));
assert.notEqual(manager.get(other.id)!.worldViewId,first.worldViewId);
assert(!runs.advance(a),"clicking an exit does not complete the room");
assert(!runs.completeRoom(first.id,"maiden"),"completion requires encounter start");
assert(runs.startRoom(first.id,"maiden"));
assert(!runs.join(player("latecomer"),first.id),"no late recruits");
b = disconnect(b);
assert(runs.completeRoom(first.id,"maiden"));
assert(!runs.completeRoom(first.id,"maiden"),"duplicate boss callbacks cannot advance twice");
assert(!runs.completeRoom(first.id,"bloat"),"out-of-order completion is rejected");
collisionAvailable=false;
assert(!runs.advance(a));
assert.equal(manager.get(a.id)!.id,first.id,"failed map construction preserves the old room");
collisionAvailable=true;
assert(runs.advance(a));
runs = new TheatreRuns(instances,store); // hot reload must not lose parties
assert(runs.resume(b));
assert.equal(manager.get(b.id)!.id,manager.get(a.id)!.id);
assert.deepEqual([b.tileX,b.tileY,b.level],[3322,4447,0],"rejoin at party's current entrance, not personal checkpoint");
assert(!runs.resume(b),"active participants cannot use resume to reset themselves");
for(let i=1;i<6;i++) {
    const room = manager.get(a.id)!;
    assert.equal(a.level,THEATRE_ROOMS[i].entrance.level);
    assert(runs.startRoom(room.id,THEATRE_ROOMS[i].id));
    assert(runs.completeRoom(room.id,THEATRE_ROOMS[i].id));
    assert(runs.advance(a));
    assert.equal(manager.get(a.id)?.id,manager.get(b.id)?.id,"party moves together");
}
assert(!a.raidProgress.checkpoint && !b.raidProgress.checkpoint);
assert.deepEqual([a.tileX,a.tileY,a.level],[THEATRE_OUTSIDE.x,THEATRE_OUTSIDE.y,0]);
const solo = manager.get(other.id)!;
assert(runs.startRoom(solo.id,"maiden")); assert(runs.completeRoom(solo.id,"maiden"));
const returned = disconnect(other);
assert(!manager.getById(solo.id),"last disconnect frees the map instance");
assert(runs.resume(returned));
assert.equal(runs.current(returned)!.roomIndex,1,"solo resumes after last completed room");
let c=player("charlie"),d=player("dana");
assert(runs.create(c,"party")); assert(runs.join(d,manager.get(c.id)!.id));
const group=manager.get(c.id)!;
assert(runs.startRoom(group.id,"maiden"));assert(runs.completeRoom(group.id,"maiden"));
assert(runs.advance(c));
c=disconnect(c);d=disconnect(d);
assert(runs.resume(d));assert(runs.resume(c));
assert.equal(manager.get(c.id)!.id,manager.get(d.id)!.id,"fully disconnected party restores one shared instance");
assert.equal(c.tileY,4447);
const abandoned=disconnect(c);
abandoned.raidProgress.clear();
assert(!runs.resume(abandoned));
assert(!runs.join(abandoned,manager.get(d.id)!.id),"discarded checkpoints cannot rejoin through the normal party menu");
const failureOwner=player("failure-owner"),failureMember=player("failure-member");
assert(runs.create(failureOwner,"party"));
assert(runs.join(failureMember,manager.get(failureOwner.id)!.id));
const failureRoom=manager.get(failureOwner.id)!;
assert(runs.startRoom(failureRoom.id,"maiden"));assert(runs.completeRoom(failureRoom.id,"maiden"));
failureOwner.raidProgress.persist=()=>{throw new Error("save interrupted");};
assert.throws(()=>runs.advance(failureOwner),/save interrupted/);
assert(!manager.get(failureOwner.id) && !manager.get(failureMember.id),"failed transfer cannot strand half the party");
assert.equal(failureOwner.raidProgress.checkpoint?.status,"disconnected");
assert.equal(failureMember.raidProgress.checkpoint?.status,"disconnected");
failureOwner.raidProgress.persist=()=>{};
assert(runs.resume(failureOwner));assert(runs.resume(failureMember));
assert.equal(runs.current(failureOwner)!.roomIndex,1);

const checkpoint: RaidCheckpoint = {version:1,raid:"theatre-of-blood",runId:"test-run",completedRooms:2,
    access:"solo",roster:["tester"],status:"disconnected"};
for(const action of ["trade","pick up items","open a bank","teleport","leave","log out"] as const) {
    const state = new PlayerRaidState(); state.deserialize(checkpoint);
    let accept:()=>void = ()=>{};
    let saved=false,acted=0;
    state.confirm=(_action,cb)=>{accept=cb;};
    state.persist=()=>{assert.equal(state.serialize(),null);saved=true;};
    assert(state.guard(action,()=>{assert(saved);acted++;}));
    assert(state.checkpoint,"cancelling/leaving dialog alone must preserve progress");
    assert.equal(acted,0);
    accept(); accept();
    assert.equal(acted,1,"confirmation is single use");
    assert.equal(state.serialize(),null);
}
const state=new PlayerRaidState(); state.deserialize(checkpoint);
let accept=()=>{},acted=false;
state.confirm=(_a,cb)=>{accept=cb;};
state.persist=()=>{throw new Error("disk full");};
state.guard("trade",()=>{acted=true;});
assert.throws(()=>accept(),/disk full/); assert(state.checkpoint); assert(!acted);
state.persist=()=>{};
state.guard("open a bank",()=>{acted=true;});
state.set({...checkpoint,runId:"different-run"}); accept(); assert(!acted,"stale confirmation rejected");
state.set({...checkpoint,status:"active"});
assert(!state.guard("pick up items",()=>{}),"legitimate in-raid pickups remain possible");
state.deserialize({...checkpoint,status:"active"});
assert.equal(state.checkpoint?.status,"disconnected","server interruption can resume the last durable checkpoint");
assert.equal(mergePlayerPersistentVars({raidCheckpoint:checkpoint},{raidCheckpoint:null})!.raidCheckpoint,null);
console.log("Theatre padded geometry, party isolation/advance/reconnect, solo recovery and durable confirmation guards passed");
