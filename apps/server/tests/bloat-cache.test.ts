import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { SceneBuilder, LocLoadType } from "@august/osrs-engine/scene/SceneBuilder";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { theatreRoomGeometry } from "@server/content/modules/theatre-of-blood/rooms";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { SailingWorldView } from "@server/game/sailing/SailingWorldView";
import { PathService } from "@server/pathfinding/PathService";
import { MovementProcessor } from "@server/game/movement/engine/MovementProcessor";
import { NpcState } from "@server/game/npc";
import { BLOAT_ASSETS, BLOAT_ROUTE, BLOAT_TIMING, bloatNearestEdge } from "@server/content/modules/theatre-of-blood/BloatEncounter";

const data = loadCache(loadCacheList(loadCacheInfos()).latest), cache = CacheSystem.fromFiles("dat2", data.files);
const factory = getCacheLoaderFactory(data.info, cache);
const npc = factory.getNpcTypeLoader().load(8359);
assert.equal(npc.size, 5);
assert(npc.actions.includes("Attack"));
console.log("Bloat animation cache", {idle:npc.idleSeqId,walk:npc.walkSeqId});
for (const id of [BLOAT_ASSETS.flies, BLOAT_ASSETS.spread, ...BLOAT_ASSETS.hands, BLOAT_ASSETS.stunned, BLOAT_ASSETS.blood]) {
    const s = factory.getSpotAnimTypeLoader().load(id);
    assert(s.modelId >= 0 && s.sequenceId > 0);
    const seq = factory.getSeqTypeLoader().load(s.sequenceId);
    console.log("Bloat effect", id, s.sequenceId, seq.frameLengths?.reduce((a:number,b:number)=>a+b,0));
    if(id===1570) {
        assert.equal(seq.frameLengths.reduce((a,b)=>a+b,0),168,"native shadow/fall/bounce lifetime is under six ticks");
        let cycle=0;
        for(let i=0;i<seq.frameIds.length;i++) {
            const frame=factory.getSeqFrameLoader().load(seq.frameIds[i])!;
            if(frame.transformGroups.some((g,j)=>frame.base.types[g]===1&&frame.transformY[j]>=0)) {
                assert.equal(cycle,96);
                assert.equal(Math.ceil(cycle/30),BLOAT_TIMING.handDelay,"damage begins on first game tick after visible ground contact");break;
            }
            cycle+=seq.frameLengths[i];
        }
    }
}
const locs = factory.getLocTypeLoader();
const models = new LocModelLoader(locs, factory.getModelLoader(), factory.getTextureLoader(), factory.getSeqTypeLoader(), factory.getSeqFrameLoader(), factory.getSkeletalSeqLoader());
const builder = new SceneBuilder(data.info, factory.getMapFileLoader(), factory.getUnderlayTypeLoader(), factory.getOverlayTypeLoader(), locs, models, data.xteas);
const g = theatreRoomGeometry(1), scene = builder.buildInstanceScene(buildInstanceTemplate([g.copy]), g.sceneBase.x, g.sceneBase.y, 104, 104, false, LocLoadType.MODELS);
const path = new PathService({ getMapSquare: () => undefined } as any);
path.registerWorldViewCollision(3000, {containsWorldTile:()=>true,getCollisionFlag:()=>0} as any);
path.registerWorldViewCollision(4000, new SailingWorldView(4000, g.sceneBase.x, g.sceneBase.y, 104, 104, scene.collisionMaps));
for (let i=0;i<BLOAT_ROUTE.length;i++) for(const direction of [-1,1]) {
    const from=BLOAT_ROUTE[i],to=BLOAT_ROUTE[(i+direction+BLOAT_ROUTE.length)%BLOAT_ROUTE.length];
    const route=path.findPathSteps({from:{...from,plane:0},to,size:5,worldViewId:4000},{maxSteps:2});
    assert(route.ok && route.steps?.length===1 && route.end?.x===to.x && route.end?.y===to.y,`5x5 step ${JSON.stringify(from)} to ${JSON.stringify(to)}`);
}
const sees=(x:number,y:number)=>bloatNearestEdge({tileX:3299,tileY:4447,size:5},{x,y}).some(from=>path.projectileRaycast({...from,plane:0},{x,y},4000).clear);
assert(!sees(3290,4447),"tank blocks flies and stomp on opposite side");
assert(sees(3301,4441),"same corridor is visible");
const processor=new MovementProcessor(path);
for(const run of [false,true])for(const direction of [-1,1]) {
    const n=new NpcState(50,8359,5,8080,8081,32,{x:3299,y:4447,level:0},{worldViewId:4000,effectImmunities:{freeze:true,bind:true,stun:true}});
    n.scriptedMovement=true;
    let moved=0;
    for(let tick=1;tick<=50;tick++) {
        const i=BLOAT_ROUTE.findIndex(t=>t.x===n.tileX&&t.y===n.tileY);
        assert(i>=0);
        n.setPath(Array.from({length:run?2:1},(_,j)=>BLOAT_ROUTE[(i+direction*(j+1)+44)%44]),run);
        assert(processor.processEntity(n,tick),"real NPC movement accepts each frame");
        moved+=n.drainStepPositions().length;
    }
    assert(moved>=(run?90:50),"run covers almost twice the distance, with protocol-safe corner steps");
    assert(n.isImmuneToEffect("freeze"));
    n.drainCombatStat("defence",1);n.restoreCombatStat("defence");assert(!n.isCombatStatReduced("defence"));
}
assert(path.projectileRaycast({x:3301,y:4447,plane:0},{x:3290,y:4447}).clear,"unscoped empty map lacks tank: scoped ray must use instance collision");
console.log("Bloat cache: native effects, complete 5x5 loop in both directions, tank LOS passed");
