import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { ClientScriptLoader } from "@client/engine/cs2/ClientScriptLoader";
import { Cs2Vm, createScriptEvent } from "@client/engine/cs2/Cs2Vm";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { WidgetPacketQueue } from "@client/engine/game/widgets/WidgetPacketQueue";
import { PlayerWidgetManager, getDefaultInterfaces } from "@server/widgets/WidgetManager";
import { PlayerVarpState } from "@server/game/state/PlayerVarpState";
import { applyClientSetting } from "@server/widgets/clientSettings";
import { getMainmodalUid, getRootInterfaceId } from "@server/widgets/viewport";
import { getDesktopTabChild } from "@server/widgets/viewport/desktop";
import { HEALTH_ORB_TIMER_VARPS, HEALTH_ORB_CURE_WIDGETS } from "@august/protocol/ui/healthOrb";
const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const cache = CacheSystem.fromFiles("dat2", data.files);
const factory = getCacheLoaderFactory(data.info, cache);
const scripts = new ClientScriptLoader({ getCacheSystem: () => cache });
const vars = new VarManager(factory.getVarBitTypeLoader());
for (const id of Object.values(HEALTH_ORB_TIMER_VARPS)) assert.equal(cache.getIndex(2).getArchive(16)?.getFile(id),undefined,"status display varps must not overwrite cache variables");
const manager = new WidgetManager(cache);
const vm = new Cs2Vm({ widgetManager: manager, varManager: vars, loadScript: (id: number) => scripts.load(id),
    enumTypeLoader: factory.getEnumTypeLoader(), windowMode: 2, clientRevision: data.info.revision,
    structTypeLoader: factory.getStructTypeLoader(), paramTypeLoader: factory.getParamTypeLoader(),
    setViewportFovValues() {}, setViewportZoomRange() {}, setMinimapZoom() {},
    getViewportFovValues: () => ({ low: 256, high: 205 }), getViewportZoomRange: () => ({ min: 256, max: 320 }),
} as never);
manager.resize(1000,700);
for (const uid of HEALTH_ORB_CURE_WIDGETS) {
    manager.getGroup(uid >>> 16);
    const w = manager.getWidgetByUid(uid)!;
    assert.equal(w.actions?.[0],"Cure");
    assert((w.flags! & 2) !== 0,"native Cure operation must transmit to server");
}
// Root/chat callbacks own the gameframe. Other tabs' content is irrelevant here.
const scriptErrors: unknown[] = [];
manager.onLoadListener = (_id, w) => {
    if (![548,161,164,162].includes(w.groupId)) return;
    vm.runScriptEvent(createScriptEvent({ widget: w, args: w.onLoad! }));
    if (vm.lastError) scriptErrors.push(vm.lastError);
};
manager.onSubChangeInvoker = w => { vm.invokeEventHandler(w, "onSubChange"); assert.equal(vm.lastError, null); };
const consumed: any[] = [];
const queue = new WidgetPacketQueue(() => manager, () => scripts, p => {
    consumed.push(p);
    if (p.action === "set_root") {
        vm.context.windowMode = p.groupId === 548 ? 1 : 2;
        vars.setVarbit(4607, p.groupId === 164 ? 1 : 0);
        vars.setVarcInt(170, p.groupId === 164 ? 1 : 0);
        manager.setRootInterface(p.groupId);
    }
    if (p.action === "open_sub") manager.openSubInterface(p.targetUid, p.groupId, p.type);
});
const player: any = { id: 1, displayMode: 1, widgets: new PlayerWidgetManager(), varps: new PlayerVarpState() };
player.varps.deserialize(undefined);
let sent = 0;
const emit = (p: any) => { sent++; queue.enqueue(p); };
player.widgets.setDispatcher(emit);
const services: any = { viewport: { getDefaultInterfaces, getMainmodalUid }, system: { getCurrentTick: () => 1 },
    dialog: { getInterfaceService: () => ({ triggerCloseHooksForEntries() {} }), queueWidgetEvent: (_id: number,p: any) => emit(p),
        openSubInterface: (_p: any,targetUid: number,groupId: number,type: number,opts: any) => player.widgets.open(groupId,{...opts,targetUid,type}) } };
emit({action:"set_root",groupId:161});
for (const m of getDefaultInterfaces(1)) player.widgets.open(m.groupId, m);
for (const mode of [2,0,1,2,1,0]) {
    applyClientSetting(player,services,0,mode);
    queue.flush();
    assert.equal(consumed.length,sent,"full packet transaction must drain, including chat and every tab");
    assert.equal(manager.rootInterface,getRootInterfaceId(mode));
    for (const m of getDefaultInterfaces(mode)) assert.equal(manager.getSubInterface(m.targetUid)?.group,m.groupId);
    assert.equal(manager.isEffectivelyHidden(manager.getGroup(162)!.root.uid),false,"chat remains visible");
    const activeRoot = manager.rootInterface;
    const tabButtons = [...manager.getGroup(activeRoot)!.widgetsByUid.values()]
        .filter(w => w.eventHandlers?.onOp?.scriptId === 914);
    assert.equal(tabButtons.length,14,"all native tab buttons must be initialized");
    for (const button of tabButtons) {
        const tab = button.eventHandlers!.onOp!.intArgs[2];
        assert.equal(manager.isEffectivelyHidden(button.uid),false,"tab button remains visible after switch");
        vm.invokeEventHandler(button,"onOp",{opIndex:1});
        assert.equal(vm.lastError,null,"native tab operation must execute after layout replacement");
        assert.equal(vars.getVarcInt(171),tab,"click selects its own tab");
        assert.equal(manager.isEffectivelyHidden((activeRoot << 16) | getDesktopTabChild(mode,tab)),false,"selected tab content remains visible");
    }
    let wrong = false;
    const normal: typeof manager.onSubChangeInvoker = manager.onSubChangeInvoker;
    manager.onSubChangeInvoker = w => { if ([548,161,164].includes(w.groupId) && w.groupId !== activeRoot) wrong = true; normal?.(w); };
    manager.triggerOnSubChange(); manager.onSubChangeInvoker = normal;
    assert.equal(wrong,false,"no old gameframe callback can rewrite active tab state");
}
assert.deepEqual(scriptErrors.map(e => String(e)), [], "script errors must not be swallowed by the server dispatcher");
console.log("Full server layout transactions preserve all tab mounts and chat across six switches");
