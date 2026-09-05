import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";

(globalThis as { self?: unknown }).self = globalThis;
const { SceneRaycaster } = require("@client/engine/game/scene/SceneRaycaster");
const { checkInteractions } = require("@client/engine/rendering/render/interact/check");
const { worldEntriesToSimple } = require("@client/ui/runtime/menu/MenuBridge");
const { ClientState } = require("@client/engine/game/ClientState");
const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const cache = CacheSystem.fromFiles("dat2", data.files);
const factory = getCacheLoaderFactory(data.info, cache);
const client = {
    locTypeLoader: factory.getLocTypeLoader(),
    varManager: new VarManager(factory.getVarBitTypeLoader()),
    textureLoader: factory.getTextureLoader(),
    modelLoader: factory.getModelLoader(),
    seqTypeLoader: factory.getSeqTypeLoader(),
    seqFrameLoader: factory.getSeqFrameLoader(),
    skeletalSeqLoader: factory.getSkeletalSeqLoader?.(),
};
const raycaster = new SceneRaycaster({}, client);
const deferredClient = { ...client, textureLoader: undefined };
const deferredRaycaster = new SceneRaycaster({}, deferredClient);
const deferredLoc = client.locTypeLoader.load(1276);
const deferredModelType = deferredLoc.types?.[0] ?? 10;
assert.equal(deferredRaycaster.getLocModelMesh(deferredLoc, deferredModelType, 0), undefined);
Object.assign(deferredClient, { textureLoader: client.textureLoader });
assert(deferredRaycaster.getLocModelMesh(deferredLoc, deferredModelType, 0),
    "objects probed before loaders are ready become pickable when loading finishes");
const streamingRaycaster = new SceneRaycaster({}, client);
const actualLoader = streamingRaycaster.getInteractLocModelLoader();
const getAnimated = actualLoader.getModelAnimated.bind(actualLoader);
let modelReady = false;
actualLoader.getModelAnimated = (...args: any[]) => modelReady ? getAnimated(...args) : undefined;
assert.equal(streamingRaycaster.getLocModelMesh(deferredLoc, deferredModelType, 0), undefined);
modelReady = true;
assert(streamingRaycaster.getLocModelMesh(deferredLoc, deferredModelType, 0),
    "JS5 model miss must be retried after the model arrives, without reloading the client");
for (const id of [1276, 1281, 7452, 10060]) {
    const loc = raycaster.getResolvedLocType(id, new Map());
    assert(loc, `object ${id} resolves`);
    assert(raycaster.isLocTypeInteractive(loc), `${loc.name} is interactive`);
    const modelType = loc.types?.[0] ?? 10;
    const mesh = raycaster.getLocModelMesh(loc, modelType, 0);
    assert(mesh, `${loc.name} ${id} has a pickable model`);
    let hit = false;
    for (let face = 0; face < mesh.faceCount && !hit; face++) {
        const points = [mesh.indices1[face], mesh.indices2[face], mesh.indices3[face]].map(index =>
            [mesh.verticesX[index] / 128, mesh.verticesY[index] / 128, mesh.verticesZ[index] / 128]);
        const center = [0, 1, 2].map(axis => points.reduce((n, point) => n + point[axis], 0) / 3);
        const u = points[1].map((n, i) => n - points[0][i]);
        const v = points[2].map((n, i) => n - points[0][i]);
        const normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        const length = Math.hypot(...normal);
        if (length < 1e-6) continue;
        const direction = normal.map(n => -n / length);
        hit = raycaster.intersectLocModel({ origin: center.map((n, i) => n - direction[i]), direction },
            10, loc, modelType, 0, 0, 0, 0) !== undefined;
    }
    assert(hit, `${loc.name} ${id} ray intersects real cache geometry`);

    // Exercise the real world-menu builder with debug IDs OFF, as on player clients.
    const canvas = { __ui: {} };
    const game: any = { ...client, debugId: false, menuOpen: false, tooltips: true,
        inputManager: { pickX: -1, pickY: -1, leftClickX: -1, leftClickY: -1, mouseX: 100, mouseY: 100 },
        camera: { containsScreenPoint: () => true },
        isPointOverWidget: () => false, npcEcs: {}, playerEcs: {},
        menuActiveSimpleEntries: [], menuEntries: [],
    };
    ClientState.isItemSelected = 0; ClientState.isSpellSelected = false;
    const host: any = {
        osrsClient: game, stats: { frameCount: 100 }, app: { width: 800, height: 600, gl: { canvas } },
        lastPickFrame: -100, cachedMenuEntries: [], cachedClientMenuEntries: [],
        cachedLocIds: new Set(), cachedObjIds: new Set(), cachedNpcIds: new Set(), cachedPlayerIds: new Set(),
        isMouseInUIRegion: () => false, computeTileAt: () => ({ tileX: 3200, tileY: 3200, plane: 0 }),
        screenToRay: () => ({}), getPlayerRawPlane: () => 0,
        sceneRaycaster: { raycast: () => [{ interactType: 1, interactId: id, tileX: 3200, tileY: 3200 }] },
        buildSimpleMenuEntries: (entries: any[]) => worldEntriesToSimple(entries),
        updateInteractHighlightHoverTarget: () => {},
    };
    checkInteractions(host);
    assert(game.menuEntries.some((entry: any) => entry.option === "Examine" && entry.targetId === id),
        `${loc.name}: normal player receives object menu`);
    for (const action of loc.actions.filter(Boolean)) {
        assert(game.menuEntries.some((entry: any) => entry.option === action && entry.targetId === id),
            `${loc.name}: ${action} survives the full menu-building path`);
    }
}
console.log("Real-cache world object picking passed");
