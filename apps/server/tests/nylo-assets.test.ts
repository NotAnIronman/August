import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import assert from "node:assert/strict";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { SceneBuilder, LocLoadType } from "@august/osrs-engine/scene/SceneBuilder";
import { getIdFromTag } from "@august/osrs-engine/scene/entity/EntityTag";
import { PathService } from "@server/pathfinding/PathService";
import { SailingWorldView } from "@server/game/sailing/SailingWorldView";
import { theatreRoomGeometry } from "@server/content/modules/theatre-of-blood/rooms";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { NYLO_LANES, nyloTunnelStep, insideNylo } from "@server/content/modules/theatre-of-blood/NyloEncounter";
import { NpcManager } from "@server/game/npcManager";
const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const f = getCacheLoaderFactory(data.info, CacheSystem.fromFiles("dat2", data.files));
for (let id = 8342; id <= 8347; id++) {
    const n = f.getNpcTypeLoader().load(id);
    assert(n.actions.includes('Attack'));
    assert.equal(n.size, id < 8345 ? 1 : 2);
}
for (const id of [8355, 8356, 8357])
    assert(f.getNpcTypeLoader().load(id).actions.includes('Attack'));
for (const id of [32656, 32758, 41437]) {
    const l = f.getLocTypeLoader().load(id);
    assert(l.models.length > 0);
    assert(l.actions.some(Boolean));
}
const locs = f.getLocTypeLoader();
const models = new LocModelLoader(locs, f.getModelLoader(), f.getTextureLoader(), f.getSeqTypeLoader(), f.getSeqFrameLoader(), f.getSkeletalSeqLoader());
const builder = new SceneBuilder(data.info, f.getMapFileLoader(), f.getUnderlayTypeLoader(), f.getOverlayTypeLoader(), locs, models, data.xteas);
const g = theatreRoomGeometry(2), scene = builder.buildInstanceScene(buildInstanceTemplate([g.copy]), g.sceneBase.x, g.sceneBase.y, 104, 104, false, LocLoadType.NO_MODELS);
const path = new PathService({ getMapSquare: () => undefined } as any);
path.registerWorldViewCollision(4000, new SailingWorldView(4000, g.sceneBase.x, g.sceneBase.y, 104, 104, scene.collisionMaps));
for (const tile of NYLO_LANES.flat())
    for (const size of [1, 2]) {
        const manager = new NpcManager({} as any,path,f.getNpcTypeLoader(),f.getBasTypeLoader());
        const n = manager.spawnTransientNpc({id:size===1?8342:8345,...tile,level:0,worldViewId:4000,isAggressive:false,isImmovable:false,wanderRadius:0,respawns:false})!;
        assert(n);
        n.scriptedMovement = true;
        n.scriptedCollisionStep = nyloTunnelStep;
        const firstStep=n.tileX>3300?{x:n.tileX-1,y:n.tileY}:n.tileX<3290?{x:n.tileX+1,y:n.tileY}:{x:n.tileX,y:n.tileY+1};
        n.applyFreeze(2,0);n.setPath([firstStep],false);manager.tick(1);
        assert.deepEqual({x:n.tileX,y:n.tileY},{x:tile.x,y:tile.y},"tunnel permission does not bypass ice freezes");
        n.clearFreeze();
        for (let tick = 1; tick <= 14 && !(insideNylo({ x: n.tileX, y: n.tileY }) && insideNylo({ x: n.tileX + size - 1, y: n.tileY + size - 1 })); tick++) {
            const from = { x: n.tileX, y: n.tileY };
            const to = n.tileX > 3300 ? { x: n.tileX - 1, y: n.tileY } : n.tileX < 3290 ? { x: n.tileX + 1, y: n.tileY } : { x: n.tileX, y: n.tileY + 1 };
            assert(nyloTunnelStep(from, to));
            assert(!nyloTunnelStep(to, from), "never grants outward traversal");
            n.setPath([to], false);
            manager.tick(tick);
            assert.deepEqual({x:n.tileX,y:n.tileY},to,`full NPC manager tunnel step ${JSON.stringify(from)} size ${size}`);
        }
        assert(insideNylo({ x: n.tileX, y: n.tileY }) && insideNylo({ x: n.tileX + size - 1, y: n.tileY + size - 1 }));
        n.scriptedCollisionStep = undefined;
        const route = path.findPathSteps({ from: { x: n.tileX, y: n.tileY, plane: 0 }, to: { x: 3294, y: 4247 }, size, worldViewId: 4000 }, { maxSteps: 96 });
        assert(route.ok && route.steps?.length, "normal collision resumes inside arena");
    }
const outside = builder.buildScene(3656, 3192, 64, 64, false, LocLoadType.NO_MODELS);
let grave = false;
for (const plane of outside.tiles)
    for (const row of plane)
        for (const tile of row) {
            if (!tile)
                continue;
            for (const l of tile.locs)
                if (getIdFromTag(l.tag) === 32656 && tile.x + 3656 === 3657 && tile.y + 3192 === 3223)
                    grave = true;
        }
assert(grave, "recovery uses the real northern Theatre chest");
console.log('Nylo forms, supply/recovery assets and all six lane routes verified');
