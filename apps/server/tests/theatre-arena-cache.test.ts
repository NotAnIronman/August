import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { SceneBuilder, LocLoadType } from "@august/osrs-engine/scene/SceneBuilder";
import { getIdFromTag } from "@august/osrs-engine/scene/entity/EntityTag";
import { THEATRE_ROOMS, theatreRoomGeometry } from "@server/content/modules/theatre-of-blood/rooms";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { THEATRE_ARENAS, THEATRE_BARRIER_ID } from "@server/content/modules/theatre-of-blood/arenas";
import { NpcManager } from "@server/game/npcManager";
import type { PathService } from "@server/pathfinding/PathService";
import type { MapCollisionService } from "@server/world/MapCollisionService";
import { THEATRE_COMBAT_STATS, theatreHitpoints } from "@server/data/theatreCombatStats";
import { DIRECTION_TO_ORIENTATION } from "@august/game-model/movement/Direction";
const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const factory = getCacheLoaderFactory(data.info,CacheSystem.fromFiles("dat2",data.files));
const npcs = factory.getNpcTypeLoader(), locs = factory.getLocTypeLoader();
assert.deepEqual(Object.values(THEATRE_ARENAS).map(a=>[a.boss.x,a.boss.y]),
    [[3162,4444],[3299,4447],[3294,4247],[3278,4326],[3169,4386],[3168,4326]]);
assert.equal(locs.load(32741).actions[0],"Search");
assert.equal(factory.getObjTypeLoader().load(22516).name,"Dawnbringer");
const walk=factory.getSeqTypeLoader().load(819);
assert.equal(walk.frameStep,-1,"the standard walk needs explicit looping during long forced movement");
const npcManager=new NpcManager({} as MapCollisionService,
    {findPathSteps:()=>({ok:false,steps:[]})} as unknown as PathService,npcs,factory.getBasTypeLoader());
for (const id of [8360,8359,8355,8388,8340,8370]) {
    assert(npcs.load(id).actions.includes("Attack"),`${id}: native Attack action exists`);
    const npc=npcManager.spawnTransientNpc({id,x:3200,y:4400,level:0,isAggressive:false,isImmovable:true,
        respawns:false,immunities:{poison:true,venom:true},worldViewId:4000});
    assert(npc);
    const stats=THEATRE_COMBAT_STATS[id];
    assert.equal(npc.getMaxHitpoints(),stats.hitpoints);
    assert.deepEqual([npc.combat.attackLevel,npc.combat.strengthLevel,npc.combat.defenceLevel,npc.combat.magicLevel,npc.combat.rangedLevel],
        [stats.attackLevel,stats.strengthLevel,stats.defenceLevel,stats.magicLevel,stats.rangedLevel]);
    assert.deepEqual([npc.combat.defenceStab,npc.combat.defenceSlash,npc.combat.defenceCrush,npc.combat.defenceMagic,npc.combat.defenceRanged],
        [stats.defenceBonuses!.stab,stats.defenceBonuses!.slash,stats.defenceBonuses!.crush,stats.defenceBonuses!.magic,stats.defenceBonuses!.ranged]);
    assert.equal(npc.attackSpeed,stats.attackSpeed);assert.equal(npc.combat.maxHit,stats.maxHit);
    npc.configureHitpoints(theatreHitpoints(stats.hitpoints,1));
    const hp=npc.getHitpoints();npc.applyDamage(25);
    assert.equal(npc.getHitpoints(),hp-25,"native damage works on all combat forms");
    assert(npc.isCombatTargetable(10));assert(npc.isImmuneToEffect("poison"));assert(npc.isImmuneToEffect("venom"));
    npcManager.removeNpc(npc.id);
}
for (const arena of [THEATRE_ARENAS.maiden,THEATRE_ARENAS.xarpus]) {
    const npc=npcManager.spawnTransientNpc({...arena.boss,level:0,isAggressive:false})!;
    assert.equal(npc.orientation,DIRECTION_TO_ORIENTATION[arena.boss.direction!]);
    npcManager.removeNpc(npc.id);
}
assert.equal(locs.load(THEATRE_BARRIER_ID).actions[0],"Pass");
assert.equal(npcs.load(THEATRE_ARENAS.verzik.boss.id).actions[0],"Talk-to");
const models = new LocModelLoader(locs,factory.getModelLoader(),factory.getTextureLoader(),factory.getSeqTypeLoader(),factory.getSeqFrameLoader(),factory.getSkeletalSeqLoader());
const builder = new SceneBuilder(data.info,factory.getMapFileLoader(),factory.getUnderlayTypeLoader(),factory.getOverlayTypeLoader(),locs,models,data.xteas);
for(let i=0;i<THEATRE_ROOMS.length;i++) {
 const g=theatreRoomGeometry(i);
 const arena=THEATRE_ARENAS[g.room.id], boss=npcs.load(arena.boss.id);
 assert(boss.name && boss.name!=="null");assert(boss.modelIds?.length,"boss must have a visible cache model");
 assert(!boss.transforms,"initial boss form must not depend on unconfigured varbits");
 assert(arena.boss.x>=g.bounds.minX&&arena.boss.x<=g.bounds.maxX&&arena.boss.y>=g.bounds.minY&&arena.boss.y<=g.bounds.maxY);
 const scene=builder.buildInstanceScene(buildInstanceTemplate([g.copy]),g.sceneBase.x,g.sceneBase.y,104,104,false,LocLoadType.NO_MODELS);
 const seen=new Set<string>();
 for(const plane of scene.tiles) for(const row of plane) for(const tile of row) {
   if(!tile) continue;
   for(const loc of [...tile.locs,...(tile.wall?[tile.wall]:[])]) {
    if(getIdFromTag(loc.tag)===32741) {
        assert.equal(tile.x+g.sceneBase.x,3171);assert([4397,4398].includes(tile.y+g.sceneBase.y));assert.equal(tile.level,1);
    }
    if(getIdFromTag(loc.tag)!==THEATRE_BARRIER_ID)continue;
    seen.add(`${tile.x+g.sceneBase.x},${tile.y+g.sceneBase.y},${tile.level}`);
   }
 }
 const expected=new Set<string>();
 for(const gate of arena.gates)for(let lane=gate.min;lane<=gate.max;lane++){
    const x=gate.axis==="x"?gate.coordinate:lane, y=gate.axis==="y"?gate.coordinate:lane;
    expected.add(`${x},${y},${g.room.entrance.level}`);
 }
 assert.deepEqual([...seen].sort(),[...expected].sort(),`${g.room.name}: every gate span and plane matches the real scene`);
}
console.log("Theatre cache: six visible boss forms, all entrance/exit barriers, Pass op1 and Verzik Talk-to verified");
