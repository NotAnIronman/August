import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { ClientScriptLoader } from "@client/engine/cs2/ClientScriptLoader";
import { Cs2Vm, createScriptEvent } from "@client/engine/cs2/Cs2Vm";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { SceneBuilder, LocLoadType } from "@august/osrs-engine/scene/SceneBuilder";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { theatreRoomGeometry } from "@server/content/modules/theatre-of-blood/rooms";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { SailingWorldView } from "@server/game/sailing/SailingWorldView";
import { PathService } from "@server/pathfinding/PathService";
import { CardinalAdjacentRouteStrategy } from "@server/pathfinding/engine/RouteStrategy";
import { MAIDEN_ASSETS, maidenSpawnTiles } from "@server/content/modules/theatre-of-blood/MaidenEncounter";
const data = loadCache(loadCacheList(loadCacheInfos()).latest), cache = CacheSystem.fromFiles("dat2", data.files);
const factory = getCacheLoaderFactory(data.info, cache), widgets = new WidgetManager(cache), scripts = new ClientScriptLoader({ getCacheSystem: () => cache });
for (const id of [...MAIDEN_ASSETS.forms, 8366, 8367]) {
    const n = factory.getNpcTypeLoader().load(id);
    assert(n.actions.includes("Attack"));
    assert(n.modelIds.length);
    assert.equal(n.size, id === 8366 ? 2 : id === 8367 ? 1 : 6);
}
for (const id of [1577, 1578, 1579]) {
    const s = factory.getSpotAnimTypeLoader().load(id);
    assert(s.modelId >= 0);
    assert(s.sequenceId > 0);
}
const vars = new VarManager(factory.getVarBitTypeLoader());
const vm = new Cs2Vm({ widgetManager: widgets, varManager: vars, loadScript: (id: number) => scripts.load(id),
    enumTypeLoader: factory.getEnumTypeLoader(), structTypeLoader: factory.getStructTypeLoader(), paramTypeLoader: factory.getParamTypeLoader(),
    getPlayerLocalX: () => 3175, getPlayerLocalY: () => 4446, getPlayerPlane: () => 0, getClientCycle: () => 1,
    getSkillLevel: () => 99, getSkillBaseLevel: () => 99, windowMode: 2, clientRevision: data.info.revision } as never);
widgets.resize(1000, 700);
widgets.getGroup(28);
vars.setVarbit(6440, 2);
vars.setVarbit(6441, 1);
for (let i = 0; i < 5; i++)
    vars.setVarbit(6442 + i, 27);
vm.runScriptEvent(createScriptEvent({ args: [2301, "Alice", "Bob", "Charlie", "Dave", "Eve"] }));
assert.equal(vm.lastError, null);
const root = widgets.getWidgetByUid(28 << 16)!;
vm.runScriptEvent(createScriptEvent({ widget: root, args: root.onLoad! }));
assert.equal(vm.lastError, null, "native Theatre HUD initialization succeeds");
for (const child of [16, 20, 24, 28, 32]) {
    const orb = widgets.getWidgetByUid((28 << 16) | child)!;
    assert(!orb.isHidden, "five native health orbs are visible");
}
assert.equal(vars.getVarcString(330), "Alice");
assert.equal(vars.getVarcString(334), "Eve");
const locs = factory.getLocTypeLoader();
const models = new LocModelLoader(locs, factory.getModelLoader(), factory.getTextureLoader(), factory.getSeqTypeLoader(), factory.getSeqFrameLoader(), factory.getSkeletalSeqLoader());
const builder = new SceneBuilder(data.info, factory.getMapFileLoader(), factory.getUnderlayTypeLoader(), factory.getOverlayTypeLoader(), locs, models, data.xteas);
const g = theatreRoomGeometry(0), scene = builder.buildInstanceScene(buildInstanceTemplate([g.copy]), g.sceneBase.x, g.sceneBase.y, 104, 104, false, LocLoadType.NO_MODELS);
const path = new PathService({ getMapSquare: () => undefined } as any);
path.registerWorldViewCollision(4000, new SailingWorldView(4000, g.sceneBase.x, g.sceneBase.y, 104, 104, scene.collisionMaps));
for (const tile of maidenSpawnTiles(5)) {
    const strategy = new CardinalAdjacentRouteStrategy(3162, 4444, 6, 6);
    strategy.setCollisionGetter((x, y, p) => path.getCollisionFlagAt(x, y, p, 4000), 0);
    const route = path.findPathSteps({ from: { ...tile, plane: 0 }, to: { x: 3162, y: 4444 }, size: 2, worldViewId: 4000 }, { routeStrategy: strategy, maxSteps: 128 });
    assert(route.ok && route.end && strategy.hasArrived(route.end.x, route.end.y, 0, 2), `2x2 healer route from ${tile.x},${tile.y}`);
}
console.log("Maiden cache: models, projectiles, native five-orb HUD and all ten healer routes passed");
