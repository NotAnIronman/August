import assert from "node:assert/strict";

import { NpcInstanceFlushController } from "../game/npc/NpcInstanceFlushController";

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (predicate()) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("Timed out waiting for private-instance NPC refresh");
}

let applied = false;
let receivedContext: unknown;
const map = {
    getRenderBaseTileX: () => 2816,
    getRenderBaseTileY: () => 5304,
    getLocalTileSpan: () => 104,
    refreshNpcGeometry: () => {
        applied = true;
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
    instanceActive: true,
    // The controlled player is already local during REBUILD_REGION, so its
    // spawn packet may not provide the new private view id. NPC sync must be a
    // safe fallback when all scoped NPCs agree on one view.
    getControlledPlayerWorldViewId: () => -1,
    updateTextureArray: () => undefined,
};
const workerPool = {
    setNpcInstances: async () => undefined,
    queueNpcGeometry: async (
        _mapX: number,
        _mapY: number,
        _maxLevel: number,
        _textures: number[],
        context: unknown,
    ) => {
        receivedContext = context;
        return {
            mapX: 44,
            mapY: 83,
            loadedTextures: new Map(),
            vertices: new Uint8Array(),
            indices: new Int32Array(),
            npcs: [],
        };
    },
};
const controller = new NpcInstanceFlushController({
    getRenderer: () => renderer,
    workerPool,
    getSeqTypeLoader: () => ({}),
    getSeqFrameLoader: () => ({}),
    getNpcTypeLoader: () => ({ load: () => ({}) }),
    getBasTypeLoader: () => ({}),
} as never);

controller.instanceMap.set("sid:1", {
    serverId: 1,
    typeId: 2215,
    x: 2872,
    y: 5358,
    level: 2,
    worldViewId: 4000,
});
assert.equal(controller.getSoleSynchronizedWorldViewId(), 4000);
controller.instanceMap.set("sid:ambiguous", {
    serverId: 2,
    typeId: 2216,
    x: 2866,
    y: 5358,
    level: 2,
    worldViewId: 4001,
});
assert.equal(controller.getSoleSynchronizedWorldViewId(), -1);
controller.instanceMap.delete("sid:ambiguous");
controller.markMapPendingReload((44 << 8) + 83);
controller.scheduleFlush();
void waitFor(() => applied)
    .then(() => {
        assert.deepEqual(receivedContext, {
            baseTileX: 2816,
            baseTileY: 5304,
            tileSpan: 104,
            worldViewId: 4000,
        });
        assert.equal(controller.mapsPendingReload.size, 0);
        console.log("private-instance NPC refresh tests passed");
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
