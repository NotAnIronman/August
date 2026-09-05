import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { SceneBuilder, LocLoadType } from "@august/osrs-engine/scene/SceneBuilder";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { THEATRE_ROOMS, theatreRoomGeometry } from "@server/content/modules/theatre-of-blood/rooms";
import { resolveHeightSamplePlaneForLocal } from "@client/engine/game/scene/PlaneResolver";

const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const factory = getCacheLoaderFactory(data.info, CacheSystem.fromFiles("dat2", data.files));
const locs = factory.getLocTypeLoader();
const models = new LocModelLoader(locs, factory.getModelLoader(), factory.getTextureLoader(),
    factory.getSeqTypeLoader(), factory.getSeqFrameLoader(), factory.getSkeletalSeqLoader());
const builder = new SceneBuilder(data.info, factory.getMapFileLoader(), factory.getUnderlayTypeLoader(),
    factory.getOverlayTypeLoader(), locs, models, data.xteas);

for (let i = 0; i < THEATRE_ROOMS.length; i++) {
    const g = theatreRoomGeometry(i);
    const scene = builder.buildInstanceScene(buildInstanceTemplate([g.copy]), g.sceneBase.x, g.sceneBase.y, 104, 104, false, LocLoadType.NO_MODELS);
    const source = builder.buildScene(g.sceneBase.x, g.sceneBase.y, 104, 104, false, LocLoadType.NO_MODELS);
    const x = g.room.entrance.x - g.sceneBase.x;
    const y = g.room.entrance.y - g.sceneBase.y;
    for (let p = 0; p < 4; p++) {
        for (let wx = g.room.minX; wx <= g.room.maxX; wx++) {
            for (let wy = g.room.minY; wy <= g.room.maxY; wy++) {
                const lx = wx - g.sceneBase.x, ly = wy - g.sceneBase.y;
                const context = `${g.room.name} (${wx},${wy},${p})`;
                assert.equal(scene.tileHeights[p][lx][ly], source.tileHeights[p][lx][ly], `${context}: height`);
                assert.equal(scene.tileRenderFlags[p][lx][ly], source.tileRenderFlags[p][lx][ly], `${context}: render flags`);
                assert.equal(scene.collisionMaps[p].getFlag(lx,ly), source.collisionMaps[p].getFlag(lx,ly), `${context}: collision`);
            }
        }
    }
    const map = {
        mapX: 0, mapY: 0, canRender: () => true, delete() {},
        getTileRenderFlag: (p:number,lx:number,ly:number) => scene.tileRenderFlags[p][lx][ly],
    };
    const heightPlane = resolveHeightSamplePlaneForLocal(map, g.room.entrance.level, x, y);
    assert.equal(heightPlane, i < 4 ? 1 : g.room.entrance.level, `${g.room.name}: render on the bridge while retaining the logical spawn plane`);
    if (i < 4) {
        const broken = builder.buildInstanceScene(buildInstanceTemplate([{...g.copy,sourcePlanes:[0]}]),g.sceneBase.x,g.sceneBase.y,104,104,false,LocLoadType.NO_MODELS);
        assert.equal(broken.tileRenderFlags[1][x][y], 0, "reproduce the missing bridge flag");
        assert(scene.tileHeights[1][x][y] < broken.tileHeights[0][x][y], "the actual bridge is above the old player height");
        assert.equal(scene.tiles[0][x][y]?.isBridgeSurface, true, "bridge must also be linked into the scene's walkable floor");
    }
    if (g.room.id === "xarpus") {
        const pitTiles = scene.tiles[0].flat().filter(tile => !!tile?.tileModel).length;
        assert(pitTiles > 0, "Xarpus must include visible terrain beneath the arena");
        assert.notEqual(scene.tileHeights[0][x][y], 0, "Xarpus upper floor must inherit the real lower height base");
    }
    console.log(`${g.room.name}: all source planes, terrain heights, bridge flags and collision match the cache`);
}
