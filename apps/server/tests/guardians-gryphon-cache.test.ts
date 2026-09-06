import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { SceneBuilder, LocLoadType } from "@august/osrs-engine/scene/SceneBuilder";
import { getIdFromTag } from "@august/osrs-engine/scene/entity/EntityTag";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { BOSS_ROOMS, roomGeometry } from "@server/content/modules/guardians-gryphon/rooms";
import { NpcManager } from "@server/game/npcManager";
import { GUARDIANS_GRYPHON_COMBAT_STATS } from "@server/data/guardiansGryphonCombatStats";
import { resolveLocActionByOpNum } from "@server/network/handlers/examineHandler";
import { VARBIT_GUARDIANS_UNLOCKED } from "@august/game-model/world/BossAccess";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { PlayerVarpState } from "@server/game/state/PlayerVarpState";
import { PathService } from "@server/pathfinding/PathService";
import { GUARDIANS_DROP_TABLE, GRYPHON_DROP_TABLE } from "@server/content/gamemodes/vanilla/data/guardiansGryphonDrops";
import { getItemDefinition } from "@server/data/items";
import { getCacheLoaderFactory as rawFactory } from "@august/osrs-engine/cache/loader/CacheLoaderFactory";
import { GuardiansEncounter } from "@server/content/modules/guardians-gryphon/GuardiansEncounter";
const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const factory = getCacheLoaderFactory(data.info, CacheSystem.fromFiles("dat2", data.files));
const raw = rawFactory(data.info, CacheSystem.fromFiles("dat2", data.files));
const rawGate = raw.getLocTypeLoader().load(31681);
assert.equal(rawGate.transformVarbit, VARBIT_GUARDIANS_UNLOCKED);
const npcs = factory.getNpcTypeLoader(), locs = factory.getLocTypeLoader();
for (const id of [7852, 7882, 14860]) {
    const npc = npcs.load(id);
    assert(npc.actions.includes("Attack"));
    assert(npc.modelIds?.length);
    assert(!npc.transforms);
}
assert.equal(locs.load(58439).id, 58439);
assert.equal(locs.load(58439).transforms, undefined);
assert.equal(locs.load(58439).actions[0], "Open");
assert.equal(locs.load(31681).transformVarbit, VARBIT_GUARDIANS_UNLOCKED);
const clientVars = new VarManager(factory.getVarBitTypeLoader());
for (const [value, expected] of [[0, "Unlock"], [1, "Open"]] as const) {
    const varps = new PlayerVarpState();
    varps.setVarbitValue(VARBIT_GUARDIANS_UNLOCKED, value);
    const restored = new PlayerVarpState();
    restored.deserialize(varps.serialize());
    const player = { varps: restored };
    clientVars.setVarbit(VARBIT_GUARDIANS_UNLOCKED, value);
    assert.equal(locs.load(31681).transform(clientVars, locs)?.actions[0], expected);
    assert.equal(resolveLocActionByOpNum(locs, 31681, 1, player as never), expected, "client/server gate options agree with account unlock");
}
const manager = new NpcManager({} as never, { findPathSteps: () => ({ ok: false, steps: [] }) } as never, npcs, factory.getBasTypeLoader());
for (const room of BOSS_ROOMS)
    for (const spawn of room.bosses) {
        const npc = manager.spawnTransientNpc({ ...spawn, level: 0, respawns: false, isAggressive: false, worldViewId: 4000 })!;
        const stats = GUARDIANS_GRYPHON_COMBAT_STATS[spawn.id];
        assert.equal(npc.getMaxHitpoints(), stats.hitpoints);
        assert.equal(npc.combat.defenceLevel, stats.defenceLevel);
        assert.equal(npc.combat.magicLevel, stats.magicLevel);
        assert(npc.isCombatTargetable(10));
        npc.applyDamage(10);
        assert.equal(npc.getHitpoints(), stats.hitpoints - 10);
        manager.removeNpc(npc.id);
    }
const models = new LocModelLoader(locs, factory.getModelLoader(), factory.getTextureLoader(), factory.getSeqTypeLoader(), factory.getSeqFrameLoader(), factory.getSkeletalSeqLoader());
const builder = new SceneBuilder(data.info, factory.getMapFileLoader(), factory.getUnderlayTypeLoader(), factory.getOverlayTypeLoader(), locs, models, data.xteas);
for (const room of BOSS_ROOMS) {
    const { sceneBase: { x, y }, copy } = roomGeometry(room);
    const scene = builder.buildInstanceScene(buildInstanceTemplate([copy]), x, y, 104, 104, false, LocLoadType.NO_MODELS);
    const seen = new Set<number>();
    for (const plane of scene.tiles)
        for (const row of plane)
            for (const tile of row) {
                if (!tile)
                    continue;
                for (const loc of [...tile.locs, ...(tile.wall ? [tile.wall] : []), ...(tile.floorDecoration ? [tile.floorDecoration] : [])]) {
                    seen.add(getIdFromTag(loc.tag));
                }
            }
    assert(seen.has(room.exitId), `${room.name}: the exit is in the copied scene`);
    const tile = scene.tiles[0][room.inside.x - x][room.inside.y - y];
    assert(tile?.tileModel, `${room.name}: entrance has visible terrain`);
    const paths=new PathService({} as never);
    paths.getCollisionFlagAt=(worldX,worldY,plane)=>scene.collisionMaps[plane].getFlag(worldX-x,worldY-y);
    const reachable=new Set<string>(),queue=[room.inside as {x:number;y:number;level:number}];
    for(let i=0;i<queue.length;i++) {
        const from=queue[i];
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const to={x:from.x+dx,y:from.y+dy,level:0},key=`${to.x},${to.y}`;
            if(reachable.has(key)||to.x<room.bounds.minX||to.x>room.bounds.maxX||to.y<room.bounds.minY||to.y>room.bounds.maxY)continue;
            if(!paths.canActorStep({...from,plane:0},to,1))continue;
            reachable.add(key);queue.push(to);
        }
    }
    for(const boss of room.bosses)assert(queue.some(p=>Math.max(boss.x-p.x,p.x-(boss.x+3),boss.y-p.y,p.y-(boss.y+3))===1),
        `${room.name}: entry can walk to ${boss.id}, not become stuck in the staircase`);
    if(room.id==="grotesque-guardians") {
        const actors=room.bosses.map(spawn=>manager.spawnTransientNpc({...spawn,level:0,respawns:false,isAggressive:false,worldViewId:4000})!);
        const mechanics=new GuardiansEncounter(actors[0],actors[1],"test",room,{system:{getCurrentTick:()=>0},
            equipment:{},npc:{disengageCombat(){}},instances:{getMemberPlayers:()=>[]},movement:{getPathService:()=>paths}} as never);
        const centers:{x:number;y:number}[]=[];
        for(let i=0;i<5;i++){
            const tile=(mechanics as any).floorTile(centers,2);
            assert(tile,"the native roof has five reachable, nonoverlapping party prison locations");
            assert(reachable.has(`${tile.x},${tile.y}`));centers.push(tile);
        }
        mechanics.dispose();for(const actor of actors)manager.removeNpc(actor.id);
    }
}
for(const table of [GUARDIANS_DROP_TABLE,GRYPHON_DROP_TABLE])for(const entry of [...table.always??[],...table.pools?.flatMap(p=>p.entries)??[]]) {
    const id=entry.itemId!;
    assert(getItemDefinition(id),`reward ${id} exists in the live server item catalogue`);
    assert.notEqual(factory.getObjTypeLoader().load(id).name,"null",`reward ${id} exists in the cache`);
}
console.log("Guardians/Gryphon: visible attackable cache models, real stats, gate morphs, copied terrain and exits verified.");
