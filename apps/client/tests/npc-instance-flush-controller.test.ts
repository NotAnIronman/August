import assert from "node:assert/strict";

import { NpcInstanceFlushController } from "@client/engine/game/npc/NpcInstanceFlushController";
import { addUnbatchedNpcRenderData } from "@client/engine/rendering/render/draw";
import { markInstanceSceneCommitted } from "@client/engine/rendering/render/instance";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (predicate()) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Timed out waiting for NPC geometry flush");
}

async function staleAppearanceRefreshIsNeverApplied(): Promise<void> {
    const firstGeometry = deferred<any>();
    const instanceSnapshots: number[] = [];
    const appliedGeometry: number[] = [];
    const geometryContexts: any[] = [];
    let latestTypeId = -1;
    let geometryCalls = 0;

    const map = {
        getRenderBaseTileX: () => 48,
        getRenderBaseTileY: () => 112,
        getLocalTileSpan: () => 104,
        refreshNpcGeometry: (...args: any[]) => {
            appliedGeometry.push(args.at(-1).appearanceVersion);
        },
    };
    const mapManager = {
        currentMapX: -1,
        currentMapY: -1,
        worldEntityMapIds: new Set<number>(),
        isMapInCurrentGrid: () => false,
        getMap: () => map,
        loadMap: () => undefined,
    };
    const workerPool = {
        setNpcInstances: async (instances: Array<{ typeId: number }>) => {
            latestTypeId = instances[0]?.typeId ?? -1;
            instanceSnapshots.push(latestTypeId);
        },
        queueNpcGeometry: (...args: any[]) => {
            geometryContexts.push(args[4]);
            geometryCalls++;
            if (geometryCalls === 1) return firstGeometry.promise;
            return Promise.resolve({
                mapX: 1,
                mapY: 2,
                appearanceVersion: latestTypeId,
                loadedTextures: new Map(),
                vertices: new Uint8Array(),
                indices: new Int32Array(),
                npcs: [],
            });
        },
    };
    const renderer = {
        app: {},
        npcProgram: {},
        textureArray: {},
        textureMaterials: {},
        waterTextures: {},
        sceneUniformBuffer: {},
        mapManager,
        maxLevel: 3,
        loadedTextureIds: new Set<number>(),
        updateTextureArray: () => undefined,
        instanceActive: true,
        getControlledPlayerWorldViewId: () => 4000,
    };
    const controller = new NpcInstanceFlushController({
        getRenderer: () => renderer,
        workerPool,
        getSeqTypeLoader: () => ({}),
        getSeqFrameLoader: () => ({}),
        getNpcTypeLoader: () => ({ load: () => ({}) }),
        getBasTypeLoader: () => ({}),
    } as any);

    const mapId = (1 << 8) | 2;
    const instance = { serverId: 1, typeId: 1, x: 64, y: 128, level: 0 };
    controller.instanceMap.set("sid:1", instance);
    controller.markMapPendingReload(mapId);
    controller.scheduleFlush();

    await waitFor(() => geometryCalls === 1);

    instance.typeId = 2;
    controller.markMapPendingReload(mapId);
    controller.scheduleFlush();
    firstGeometry.resolve({
        mapX: 1,
        mapY: 2,
        appearanceVersion: 1,
        loadedTextures: new Map(),
        vertices: new Uint8Array(),
        indices: new Int32Array(),
        npcs: [],
    });

    await waitFor(() => appliedGeometry.length === 1);

    assert.deepEqual(instanceSnapshots, [1, 2]);
    assert.deepEqual(appliedGeometry, [2]);
    assert.deepEqual(geometryContexts, [
        { baseTileX: 48, baseTileY: 112, tileSpan: 104, worldViewId: 4000 },
        { baseTileX: 48, baseTileY: 112, tileSpan: 104, worldViewId: 4000 },
    ]);
    assert.equal(controller.mapsPendingReload.size, 0);
}

async function immediateAttackWaitsForCommittedInstanceScene(): Promise<void> {
    const mapId = (44 << 8) | 83;
    const spawnX = 2872;
    const movedX = spawnX + 1;
    const instanceSnapshots: number[] = [];
    const geometrySnapshots: number[] = [];
    let oldMapRefreshes = 0;
    let newMapRefreshes = 0;
    let latestWorkerX = -1;

    const oldMap = {
        getRenderBaseTileX: () => 2816,
        getRenderBaseTileY: () => 5304,
        getLocalTileSpan: () => 104,
        refreshNpcGeometry: () => {
            oldMapRefreshes++;
        },
    };
    const newInstanceMap = {
        getRenderBaseTileX: () => 2816,
        getRenderBaseTileY: () => 5304,
        getLocalTileSpan: () => 104,
        refreshNpcGeometry: (...args: any[]) => {
            newMapRefreshes++;
            geometrySnapshots.push(args.at(-1).authoritativeX);
        },
    };
    let residentMap = oldMap;
    const mapManager = {
        currentMapX: -1,
        currentMapY: -1,
        worldEntityMapIds: new Set<number>(),
        isMapInCurrentGrid: () => false,
        getMap: () => residentMap,
        loadMap: () => undefined,
    };
    const workerPool = {
        setNpcInstances: async (instances: Array<{ x: number }>) => {
            latestWorkerX = instances[0]?.x ?? -1;
            instanceSnapshots.push(latestWorkerX);
        },
        queueNpcGeometry: async () => ({
            mapX: 44,
            mapY: 83,
            authoritativeX: latestWorkerX,
            loadedTextures: new Map(),
            vertices: new Uint8Array(),
            indices: new Int32Array(),
            npcs: [],
        }),
    };
    const renderer = {
        app: {},
        npcProgram: {},
        textureArray: {},
        textureMaterials: {},
        waterTextures: {},
        sceneUniformBuffer: {},
        mapManager,
        maxLevel: 3,
        loadedTextureIds: new Set<number>(),
        updateTextureArray: () => undefined,
        instanceActive: true,
        // REBUILD_REGION has started, but its replacement map is not resident.
        instanceSceneReady: false,
        instanceSceneGeneration: 7,
        instanceRegionX: 44 * 8,
        instanceRegionY: 83 * 8,
        osrsClient: undefined as any,
        getControlledPlayerWorldViewId: () => 4000,
    };
    const controller = new NpcInstanceFlushController({
        getRenderer: () => renderer,
        workerPool,
        getSeqTypeLoader: () => ({}),
        getSeqFrameLoader: () => ({}),
        getNpcTypeLoader: () => ({ load: () => ({}) }),
        getBasTypeLoader: () => ({}),
    } as any);
    renderer.osrsClient = {
        notifyRendererReady: () => controller.notifyRendererReady(),
    };

    const instance = {
        serverId: 1,
        typeId: 2215,
        x: spawnX,
        y: 5358,
        level: 2,
        worldViewId: 4000,
    };
    controller.instanceMap.set("sid:1", instance);
    controller.markMapPendingReload(mapId);
    controller.scheduleFlush();

    await waitFor(
        () => instanceSnapshots.length === 1 && controller.mapsPendingReload.has(mapId),
    );
    assert.equal(oldMapRefreshes, 0, "spawn geometry must not attach to the old map");

    // Reproduce the immediate attack: authoritative NPC movement arrives while
    // the instance terrain is still building.
    instance.x = movedX;
    residentMap = newInstanceMap;
    markInstanceSceneCommitted(renderer as any, {
        mapX: 44,
        mapY: 83,
        instanceSceneGeneration: 6,
    } as any);
    assert.equal(renderer.instanceSceneReady, false, "a stale async build cannot unlock sync");
    markInstanceSceneCommitted(renderer as any, {
        mapX: 44,
        mapY: 83,
        instanceSceneGeneration: 7,
    } as any);
    assert.equal(renderer.instanceSceneReady, true);

    await waitFor(() => newMapRefreshes === 1);
    assert.equal(oldMapRefreshes, 0);
    assert.deepEqual(instanceSnapshots, [spawnX, movedX]);
    assert.deepEqual(
        geometrySnapshots,
        [movedX],
        "the committed map must receive the latest authoritative position",
    );
    assert.equal(controller.mapsPendingReload.size, 0);
    controller.clearLocal();
}

function serverSpawnRendersBeforeMapBatchRefresh(): void {
    const unbatchedMap = {
        mapX: 50,
        mapY: 50,
        npcEntityIds: [] as number[],
        drawCallNpc: undefined,
        getLocalTileSpan: () => 64,
        getRenderBaseTileX: () => 50 * 64,
        getRenderBaseTileY: () => 50 * 64,
    };
    const existingMap = {
        mapX: 51,
        mapY: 50,
        npcEntityIds: [2, 3],
        drawCallNpc: {},
        getLocalTileSpan: () => 64,
        getRenderBaseTileX: () => 51 * 64,
        getRenderBaseTileY: () => 50 * 64,
    };
    const mapByNpc = new Map<number, any>([
        [1, unbatchedMap],
        [2, existingMap],
        [3, existingMap],
    ]);
    const ecs = {
        getServerLinkedEcsIds: () => [1, 2, 3],
        getWorldViewId: () => -1,
        getNpcTypeId: (id: number) => 100 + id,
        getMapX: (id: number) => mapByNpc.get(id).mapX,
        getMapY: (id: number) => mapByNpc.get(id).mapY,
        getLocalXForMap: (id: number) => 64 + id * 128,
        getLocalYForMap: (id: number) => 192 + id * 128,
        getWorldX: (id: number) => mapByNpc.get(id).mapX * 8192 + 64 + id * 128,
        getWorldY: (id: number) => mapByNpc.get(id).mapY * 8192 + 192 + id * 128,
        getLevel: () => 0,
        getRotation: () => 0,
        getServerId: (id: number) => 500 + id,
        getColorOverride: () => ({
            hue: 0,
            sat: 0,
            lum: 0,
            amount: 0,
            startCycle: 0,
            endCycle: 0,
        }),
    };
    const host = {
        unifiedActorData: true,
        loadNpcs: true,
        actorRenderCount: 0,
        actorRenderData: new Uint16Array(16 * 8),
        unbatchedNpcRenderEntries: [] as any[],
        osrsClient: { npcEcs: ecs },
        mapManager: {
            visibleMapCount: 2,
            visibleMaps: [unbatchedMap, existingMap],
        },
        getEffectiveNpcType: () => ({}),
        // NPC 2 already has a valid map draw entry. NPC 3 is present in that
        // batch but currently suppressed, so it must use the immediate path.
        shouldRenderNpcFromMap: (_map: any, id: number) => id === 2,
    };

    addUnbatchedNpcRenderData(host as any);

    assert.equal(host.actorRenderCount, 2);
    assert.deepEqual(
        host.unbatchedNpcRenderEntries.map((entry) => entry.ecsId),
        [1, 3],
    );
    assert.deepEqual(
        host.unbatchedNpcRenderEntries.map((entry) => entry.dataOffset),
        [0, 1],
    );
}

async function run(): Promise<void> {
    await staleAppearanceRefreshIsNeverApplied();
    await immediateAttackWaitsForCommittedInstanceScene();
    serverSpawnRendersBeforeMapBatchRefresh();
}

void run()
    .then(() => {
        console.log("NPC visibility and refresh regression tests passed");
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
