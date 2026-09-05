import assert from "node:assert/strict";
import { MapManager } from "@client/engine/game/MapManager";
import { mapContainsWorldTile, resolveWorldTileMap } from "@client/engine/game/scene/WorldTileMap";
import { sampleBridgeHeightForWorldTile } from "@client/engine/game/scene/BridgeHeightSampler";
import { getTileRenderFlagAt } from "@client/engine/game/scene/TileRenderFlags";
import { resolveCollisionSamplePlaneForWorldTile } from "@client/engine/game/scene/PlaneResolver";

async function run() {
    // Renderer imports require the browser global, but these tests need no GPU.
    (globalThis as any).self = globalThis;
    const { markInstanceSceneCommitted, clearInstance } = await import("@client/engine/rendering/render/instance");
    const { clampCullTileToGridBounds } = await import("@client/engine/rendering/render/camera/roof");
    const { getMapZoneDistanceFromPoint, isMapWithinRenderDistance } = await import("@client/engine/rendering/render/draw2");
    const { PlayerRenderer } = await import("@client/engine/rendering/player/PlayerRenderer");

    // Authored room bounds, padded by four tiles and rounded down to a chunk.
    const rooms = [
        { name: "Maiden", x: 3219, y: 4460, plane: 0, minX: 3155, minY: 4422 },
        { name: "Bloat", x: 3322, y: 4447, plane: 0, minX: 3269, minY: 4433 },
        { name: "Nylo", x: 3295, y: 4283, plane: 0, minX: 3280, minY: 4233 },
        { name: "Sotetseg", x: 3280, y: 4293, plane: 0, minX: 3267, minY: 4293 },
        { name: "Xarpus", x: 3170, y: 4375, plane: 1, minX: 3155, minY: 4374 },
        { name: "Verzik", x: 3168, y: 4297, plane: 0, minX: 3153, minY: 4296 },
    ];

    for (const room of rooms) {
        const baseX = Math.floor((room.minX - 4) / 8) * 8;
        const baseY = Math.floor((room.minY - 4) / 8) * 8;
        const regionX = baseX / 8 + 6;
        const regionY = baseY / 8 + 6;
        const mapX = Math.floor(regionX / 8);
        const mapY = Math.floor(regionY / 8);
        const heightMapData = new Int16Array(4 * 104 * 104);
        for (let p = 0; p < 4; p++) {
            for (let y = 0; y < 104; y++) {
                for (let x = 0; x < 104; x++) heightMapData[p * 104 * 104 + y * 104 + x] = x + y + p * 100;
            }
        }
        const map = {
            mapX, mapY, id: (mapX << 8) | mapY,
            canRender: () => true, delete() {},
            getRenderBaseTileX: () => baseX, getRenderBaseTileY: () => baseY,
            getLocalTileSpan: () => 104, heightMapSize: 104, borderSize: 0, heightMapData,
            getTileRenderFlag: (p: number, x: number, y: number) => p === 1 && x === 75 && y === 80 ? 2 : 0,
        };
        const manager = new MapManager<typeof map>(2, () => {});
        // Reproduce the resident overworld grid before REBUILD_REGION. Instance
        // update deliberately skips normal grid streaming, leaving these fields.
        Object.assign(manager, {
            activeUsingSceneBaseStreaming: true, activeSceneBaseX: 3624, activeSceneBaseY: 3168,
        });
        manager.addMap(mapX, mapY, map);
        const host: any = {
            mapManager: manager, instanceActive: true, instanceSceneGeneration: 1,
            instanceRegionX: regionX, instanceRegionY: regionY,
            instanceSceneReady: false, instanceSceneBuildPending: true,
            instanceLocRebuildPending: false, instanceLocRebuildTimer: null,
            mapsToLoad: new Map(), osrsClient: { notifyRendererReady() {} },
        };
        host.getMapZoneDistanceFromPoint = (m: any, x: number, y: number) => getMapZoneDistanceFromPoint(host, m, x, y);
        const entrance = { x: room.x, y: room.y };
        const staleCull = clampCullTileToGridBounds(host, entrance);
        assert.equal(isMapWithinRenderDistance(host, map as any, staleCull.x, staleCull.y, 25, 0), false, `${room.name}: reproduce skybox-only culling`);
        const before = manager.getGridTileBounds();
        const payload: any = { mapX, mapY, instanceSceneGeneration: 0, instanceSceneReplacesExistingMaps: true };
        markInstanceSceneCommitted(host, payload);
        assert.deepEqual(manager.getGridTileBounds(), before, "a superseded build cannot publish its bounds");
        payload.instanceSceneGeneration = 1;
        markInstanceSceneCommitted(host, payload);
        assert.deepEqual(manager.getGridTileBounds(), { minX: baseX, minY: baseY, maxX: baseX + 104, maxY: baseY + 104 });
        assert.deepEqual(clampCullTileToGridBounds(host, entrance), entrance);
        for (const point of [entrance, { x: baseX, y: baseY }, { x: baseX + 103, y: baseY + 103 }]) {
            assert.equal(getMapZoneDistanceFromPoint(host, map as any, point.x, point.y), 0);
            assert.equal(isMapWithinRenderDistance(host, map as any, point.x, point.y, 25, 0), true);
            assert.equal(resolveWorldTileMap(manager, point.x, point.y), map);
        }
        assert.equal(mapContainsWorldTile(map, baseX + 104, baseY), false);
        assert.equal(resolveWorldTileMap(manager, baseX - 1, baseY), undefined);

        // Exercise real player selection, including players across map-square
        // boundaries and the far edge of the combined instance mesh.
        const players = [entrance, { x: baseX, y: baseY }, { x: baseX + 103, y: baseY + 103 }, { x: baseX + 104, y: baseY }];
        const playerHost: any = {
            resetRenderSelectionFrameIfNeeded() {}, frameRenderPlayersByMap: new Map(),
            renderer: {
                shouldRenderPlayerIndex: () => true,
                osrsClient: {
                    renderSelf: true,
                    worldViewManager: { getWorldViewByOverlayMapId: () => undefined, getWorldView: () => undefined },
                    playerEcs: {
                        size: () => players.length, getWorldViewId: () => -1,
                        getX: (p: number) => players[p].x * 128 + 64,
                        getY: (p: number) => players[p].y * 128 + 64,
                    },
                },
            },
        };
        assert.deepEqual((PlayerRenderer.prototype as any).getRenderPlayersForMap.call(playerHost, map), [0, 1, 2], room.name);
        const sample = sampleBridgeHeightForWorldTile(manager, room.x, room.y, room.plane);
        assert.equal(sample.valid, true);
        assert.equal(sample.plane, room.plane);
        assert.equal(sample.height, -(room.x - baseX + room.y - baseY + room.plane * 100) / 16);
        assert.equal(getTileRenderFlagAt(manager, 1, baseX + 75, baseY + 80), 2);
        assert.equal(resolveCollisionSamplePlaneForWorldTile(manager, 0, baseX + 75, baseY + 80), 1);
        assert.deepEqual(sampleBridgeHeightForWorldTile(manager, baseX + 75, baseY + 80, 0), { valid: true, plane: 1, height: -255 / 16 });
        assert.equal(sampleBridgeHeightForWorldTile(manager, baseX + 90.5, baseY + 90.5, 0).height, -181 / 16, "bilinear height sampling must not clamp to tile 63");
        manager.worldEntityMapIds.add(map.id);
        assert.equal(resolveWorldTileMap(manager, baseX + 103, baseY + 103), undefined, "top-level lookup must not use sailing overlays");
        manager.worldEntityMapIds.clear();
        clearInstance(host);
        assert.equal(manager.getGridTileBounds(), undefined, "exiting must restore ordinary streaming bounds");
    }
    const normal = { mapX: 50, mapY: 50, canRender: () => true, delete() {}, heightMapSize: 76, borderSize: 6 };
    const normalManager = new MapManager<typeof normal>(2, () => {});
    normalManager.addMap(50, 50, normal);
    assert.equal(resolveWorldTileMap(normalManager, 3263, 3263), normal);
    assert.equal(resolveWorldTileMap(normalManager, 3264, 3264), undefined, "overworld borders are not renderable tiles");
    console.log("Instance visibility: all six Theatre rooms, culling, players, heights, bridge flags and exit reset passed");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
