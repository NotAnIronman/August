import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { ClientScriptLoader } from "@client/engine/cs2/ClientScriptLoader";
import { Cs2Vm, createScriptEvent } from "@client/engine/cs2/Cs2Vm";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { WidgetPacketQueue } from "@client/engine/game/widgets/WidgetPacketQueue";
import { Camera } from "@client/engine/rendering/camera/Camera";
import { WidgetTransmitProcessor } from "@client/engine/game/widgets/WidgetTransmitProcessor";
import { getViewportTrackerFrontUid, setViewportEnumService, getRootInterfaceId } from "@server/widgets/viewport";
import { ViewportEnumService, BaseComponentUids } from "@server/widgets/viewport/ViewportEnumService";

const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const cache = CacheSystem.fromFiles("dat2", data.files), factory = getCacheLoaderFactory(data.info, cache);
const scripts = new ClientScriptLoader({ getCacheSystem: () => cache });
const vars = new VarManager(factory.getVarBitTypeLoader());
getRootInterfaceId(1); // Initialize viewport before its enum service's module dependency.
const enumLoader = factory.getEnumTypeLoader();
assert(enumLoader, "current cache provides viewport mapping enums");
const mapping = new ViewportEnumService(enumLoader);
for (const mode of [0, 1, 2, 3, 4]) {
    const expected = mapping.getComponent(BaseComponentUids.VIEWPORT_TRACKER_FRONT, mode);
    setViewportEnumService(null);
    assert.equal(getViewportTrackerFrontUid(mode), expected, "fallback matches actual cache");
    setViewportEnumService(mapping);
    assert.equal(getViewportTrackerFrontUid(mode), expected);
    assert.equal(expected >>> 16, getRootInterfaceId(mode));
}
const widgets = new WidgetManager(cache);
const camera = new Camera(3219, 0, 4460, 256, 0);
(widgets as any).osrsClient = { camera, renderer: { canvas: { width: 1000, height: 700 } } };
const vm = new Cs2Vm({ widgetManager: widgets, varManager: vars, loadScript: (id: number) => scripts.load(id),
    enumTypeLoader: factory.getEnumTypeLoader(), structTypeLoader: factory.getStructTypeLoader(), paramTypeLoader: factory.getParamTypeLoader(),
    getPlayerLocalX: () => 3219, getPlayerLocalY: () => 4460, getPlayerPlane: () => 0, getClientCycle: () => 1,
    getSkillLevel: () => 99, getSkillBaseLevel: () => 99, windowMode: 2, clientRevision: data.info.revision,
    setViewportFovValues: camera.setViewportFovValues.bind(camera), setViewportZoomRange: camera.setViewportZoomRange.bind(camera), setMinimapZoom: () => {},
    setViewportClampFov: camera.setClampFov.bind(camera),
    getViewportFovValues: camera.getViewportFovValues.bind(camera), getViewportZoomRange: camera.getViewportZoomRange.bind(camera) } as never);
const run = (widget: any, args: any[]) => {
    vm.runScriptEvent(createScriptEvent({ widget, args }));
    assert.equal(vm.lastError, null);
};
widgets.onLoadListener = (_id, w) => run(w, w.onLoad!);
widgets.onSubChangeInvoker = w => vm.invokeEventHandler(w, "onSubChange");
widgets.onResizeInvoker = w => vm.invokeEventHandler(w, "onResize");
const transmits = new WidgetTransmitProcessor({ getWidgetManager: () => widgets, getCs2Vm: () => vm,
    getTransmitCycles: () => ({ changedVarpCount: 0 }), executeScriptListener: run } as never);
const queue = new WidgetPacketQueue(() => widgets, () => scripts, p => {
    if (p.action !== "open_sub") return;
    for (const [id, value] of Object.entries(p.varbits ?? {})) vars.setVarbit(Number(id), value);
    for (const s of p.preScripts ?? []) run(undefined, [s.scriptId, ...s.args]);
    widgets.openSubInterface(p.targetUid, p.groupId, p.type);
    transmits.triggerInitialVarTransmitForGroup(p.groupId);
});
widgets.resize(1000, 700);
run(undefined, [626]);
// The three selectable desktop layouts and mobile have native 3D viewports.
// Legacy fullscreen (165) has an enum mapping but no viewport in this cache.
for (const mode of [2, 0, 1, 4, 2, 0]) {
    const root = getRootInterfaceId(mode);
    vm.context.windowMode = mode === 0 ? 1 : 2;
    widgets.setRootInterface(root);
    const viewport = widgets.viewportWidget!;
    assert(viewport, `layout ${root} must select its viewport`);
    assert.equal(viewport.groupId, root, "cached roots must rebind their own viewport");
    assert(viewport.width! > 1 && viewport.height! > 1);
    // Packet preloading used to steal viewportWidget from the active layout,
    // replacing it with an unlaid-out 0x0 viewport (rendered as a 1x1 scene).
    for (const other of [161, 548, 164, 165, 601]) widgets.getGroup(other);
    assert.equal(widgets.viewportWidget, viewport, "inactive layouts cannot take over 3D rendering");
    const uid = getViewportTrackerFrontUid(mode);
    queue.enqueue({ action: "open_sub", targetUid: uid, groupId: 28, type: 1,
        varbits: { 6440: 2, 6441: 1, 6442: 27 }, preScripts: [{ scriptId: 2301, args: ["Alice", "", "", "", ""] }] });
    queue.flush();
    assert.equal(widgets.getSubInterface(uid)?.group, 28, "raid HUD actually mounts through packet queue");
    assert.equal(widgets.viewportWidget, viewport);
    camera.update(1000, 700, 0, 0, viewport.width, viewport.height);
    assert(camera.viewportWidth > 1 && camera.viewportHeight > 1);
    assert([...camera.viewProjMatrix].every(Number.isFinite));
    widgets.closeSubInterface(uid);
    assert.equal(widgets.viewportWidget, viewport);
}
setViewportEnumService(null);
console.log("Theatre HUD: real packet preloading, desktop/mobile mounts, cached root changes and nonzero 3D viewport passed");
