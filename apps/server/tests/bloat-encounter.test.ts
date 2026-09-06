import assert from "node:assert/strict";
import { BloatEncounter, BLOAT_ROUTE, BLOAT_TIMING, BLOAT_ASSETS, bloatFloor, bloatNearestEdge } from "@server/content/modules/theatre-of-blood/BloatEncounter";
import { EncounterRandom } from "@server/game/encounters/EncounterRandom";

function fixture(size=1, initialRoll=0) {
    let tick=0,wipes=0,live=true;
    const hits:any[]=[],graphics:any[]=[],seqs:number[]=[],spots:any[]=[],stuns:any[]=[];
    let ray:(from:any,to:any)=>boolean=()=>false;
    const boss:any={id:10,typeId:8359,tileX:3299,tileY:4447,size:5,level:0,worldViewId:4000,hp:2000,maxHp:2000,
        incomingPlayerDamageMultiplier:1,path:[],running:false,defence:100,
        getHitpoints(){return this.hp;},getMaxHitpoints(){return this.maxHp;},clearPath(){this.path=[];},
        setPath(steps:any[],run:boolean){this.path=steps;this.running=run;},restoreCombatStat(stat:string){assert.equal(stat,"defence");this.defence=100;}};
    const players=Array.from({length:size},(_,i)=>({id:i+1,name:`p${i}`,tileX:3288,tileY:4440+i,level:0,worldViewId:4000,hp:1000,protected:false,
        prayer:{hasPrayerActive:(key:string)=>key==="protect_from_missiles"&&players[i].protected},
        skillSystem:{getSkill:()=>({baseLevel:players[i].hp,boost:0})}}));
    const services:any={system:{getCurrentTick:()=>tick},instances:{getMemberPlayers:()=>players},
        npc:{disengageCombat(){},queueNpcSeq:(_:any,s:number)=>seqs.push(s)},
        animation:{playLocGraphic:(g:any)=>graphics.push(g),broadcastPlayerSpot:(p:any,s:number)=>spots.push({p,s})},
        movement:{getPathService:()=>({projectileRaycast:(from:any,to:any,view:number)=>{assert.equal(view,4000);return {clear:ray(from,to)};}})},
        combat:{getNpc:()=>live?boss:undefined,stunPlayer:(p:any,ticks:number)=>stuns.push({p,ticks}),
            applyNpcDamageToPlayer:(_:any,p:any,_style:number,d:number,t:number)=>{const amount=Math.min(p.hp,d);p.hp-=amount;hits.push({p,damage:d,tick:t});return {amount};}}};
    const rng=new EncounterRandom(1);rng.next=()=>initialRoll;
    const e=new BloatEncounter(boss,"room",players.map(p=>p.name),services,()=>wipes++,rng);
    e.rng.next=()=>0.99;players.forEach(p=>e.admit(p as any));
    const cycle=(count=1)=>{for(let i=0;i<count;i++){tick++;e.tick(tick);const end=boss.path.at(-1);if(end){boss.tileX=end.x;boss.tileY=end.y;boss.path=[];}}};
    return {e,boss,players,hits,graphics,seqs,spots,stuns,cycle,tick:()=>tick,wipes:()=>wipes,
        ray:(fn:typeof ray)=>{ray=fn;},live:(v:boolean)=>{live=v;},hit:()=>boss.onPlayerHit?.(players[0],1,0,tick)};
}
assert.equal(BLOAT_ROUTE.length,44);
for(let i=0;i<44;i++) {
    const a=BLOAT_ROUTE[i],b=BLOAT_ROUTE[(i+1)%44];
    assert.equal(Math.abs(a.x-b.x)+Math.abs(a.y-b.y),1,"no diagonal corner cutting");
    for(let dx=0;dx<5;dx++)for(let dy=0;dy<5;dy++)assert(bloatFloor({x:a.x+dx,y:a.y+dy}));
}
assert.deepEqual(bloatNearestEdge({tileX:3299,tileY:4447,size:5},{x:3290,y:4448}),
    Array.from({length:5},(_,i)=>({x:3299,y:4447+i})));
for(const roll of [0,0.999]) {
    const f=fixture(1,roll);const expected=roll?46:38;
    f.cycle(expected-1);assert.equal(f.e.phase,"active");assert.equal(f.boss.incomingPlayerDamageMultiplier,0.5);
    f.cycle();assert.equal(f.e.phase,"down");assert.equal(f.boss.incomingPlayerDamageMultiplier,1);assert.equal(f.seqs.at(-1),8082);
    f.boss.defence=20;f.cycle(29);assert.equal(f.boss.defence,20);
    f.cycle();assert.equal(f.boss.defence,100,"only stomp restores Defence");
    f.cycle();assert.equal(f.e.phase,"down");f.cycle();assert.equal(f.e.phase,"active");
    f.cycle(45);assert.equal(f.e.phase,"active","unattacked down adds four ticks");f.cycle();assert.equal(f.e.phase,"down");
}
{
    const f=fixture();f.cycle(38);f.hit();f.cycle(32+41);assert.equal(f.e.phase,"active");f.cycle();assert.equal(f.e.phase,"down","attacked previous down has ordinary 42-tick max");
}
{
    const f=fixture();f.e.rng.next=()=>0;
    f.cycle(31);assert.equal((f.e as any).lastTurn,-Infinity);f.cycle();assert.equal((f.e as any).lastTurn,32);
    f.cycle(6);assert.equal(f.e.phase,"down");assert.equal((f.e as any).turnCooldown,27);
    f.cycle(31);assert.equal((f.e as any).turnCooldown,27,"turn timer retained while down");
    f.cycle();assert.equal((f.e as any).turnCooldown,26,"wake-up movement counts as an active tick");
}
{
    const f=fixture();f.cycle(36);f.e.rng.next=()=>0;f.cycle();assert.equal((f.e as any).lastTurn,37);
    f.cycle(4);assert.equal(f.e.phase,"active","turn prevents scheduled down for five ticks");f.cycle();assert.equal(f.e.phase,"down");
}
{
    const f=fixture();f.boss.hp=1200;f.cycle();assert(f.boss.running);f.boss.hp=800;f.cycle();assert(f.boss.running);
    f.boss.hp=799;f.hit();f.cycle();assert(f.boss.running);f.hit();f.cycle();assert(!f.boss.running);
    f.hit();f.hit();f.cycle();assert(!f.boss.running,"two hits cancel parity on same tick");
}
{
    const f=fixture(3);const [a,b,c]=f.players;
    f.ray((from,to)=>from.x>=3299&&to.y===a.tileY || from.x===a.tileX&&from.y===a.tileY&&to.y===b.tileY || from.x===b.tileX&&from.y===b.tileY&&to.y===c.tileY);
    f.cycle();assert.equal(f.hits.length,0);f.cycle();assert.deepEqual(f.hits.map(h=>h.p),[a,b],"spread stops after one hop");
    assert.equal(f.hits[0].damage,20);assert(f.spots.some(s=>s.p===b&&s.s===BLOAT_ASSETS.spread));
}
{
    const f=fixture(2);f.players[1].protected=true;f.ray(()=>true);f.cycle(2);
    assert.deepEqual(f.hits.map(h=>h.damage),[20,15],"prayer reduces flies 25%; multiple sources cannot duplicate damage");
    f.players[0].worldViewId=4001;f.cycle();assert.equal(f.hits.filter(h=>h.p===f.players[0]).length,1,"queued damage cannot follow a player out of instance");
}
{
    const g=fixture();g.cycle(38+28);g.players[0].hp=10;g.cycle();g.players[0].hp=30;g.ray(()=>true);g.cycle();
    assert.equal(g.hits.at(-1).damage,10);assert.equal(g.players[0].hp,20,"food before stomp impact saves player");
    const h=fixture();h.cycle(38+30);assert.equal(h.hits.length,0,"tank LOS protects from stomp");
}
{
    const f=fixture();f.boss.hp=1799;f.cycle(6);
    const hands=f.graphics.filter(g=>BLOAT_ASSETS.hands.includes(g.spotId));assert.equal(hands.length,16);
    assert(hands.every(g=>bloatFloor(g.tile)&&g.worldViewId===4000));
    assert.equal(new Set(hands.map(g=>`${g.tile.x}:${g.tile.y}`)).size,16);
    Object.assign(f.players[0],{tileX:hands[0].tile.x,tileY:hands[0].tile.y});
    f.cycle(BLOAT_TIMING.handDelay-1);assert.equal(f.hits.length,0);f.cycle();assert.equal(f.hits[0].damage,50);assert.equal(f.stuns[0].ticks,5);
    f.cycle(3);const next=f.graphics.filter(g=>BLOAT_ASSETS.hands.includes(g.spotId)).slice(16);
    assert.equal(next.length,16);assert(next.every(g=>!hands.some(h=>h.tile.x===g.tile.x&&h.tile.y===g.tile.y)),"no repeats from previous wave");
    f.e.dispose();assert.equal(f.boss.incomingPlayerDamageMultiplier,1);assert.equal(f.boss.onPlayerHit,undefined);
    assert(f.graphics.some(g=>g.durationTicks===0));const n=f.hits.length;f.cycle(20);assert.equal(f.hits.length,n);
}
{
    const f=fixture();f.players[0].worldViewId=4001;f.cycle(2);assert.equal(f.wipes(),1);assert.equal(f.boss.incomingPlayerDamageMultiplier,1);
    const g=fixture();g.live(false);g.cycle();assert.equal(g.wipes(),0,"despawn disposes without resurrecting boss");
    const h=fixture();h.boss.hp=0;h.cycle();assert.equal(h.wipes(),0,"death leaves progression to arena controller");
}
console.log("Bloat timing, route, LOS, spread, running, hands, tick-eating and lifecycle passed");
