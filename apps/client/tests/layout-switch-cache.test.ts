import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { ClientScriptLoader } from "@client/engine/cs2/ClientScriptLoader";
import { Cs2Vm } from "@client/engine/cs2/Cs2Vm";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { createScriptEvent } from "@client/engine/cs2/Cs2Vm";
import { WidgetPacketQueue } from "@client/engine/game/widgets/WidgetPacketQueue";
import { FOLLOWER_ITEM_DEFINITIONS } from "@august/custom-content/npcs/followerDefinitions";
import { encodeClientMessage } from "@client/core/network/packet/ClientBinaryEncoder";
assert.deepEqual(Array.from(encodeClientMessage({ type: "pet_examine", payload: { npcId: 1234 } })), [198, 0, 0, 4, 210]);

const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const cache = CacheSystem.fromFiles("dat2", data.files);
const scripts = new ClientScriptLoader({ getCacheSystem: () => cache });
const factory = getCacheLoaderFactory(data.info, cache);
const vars = new VarManager(factory.getVarBitTypeLoader());
const manager = new WidgetManager(cache);
const vm = new Cs2Vm({ widgetManager: manager, varManager: vars,
    loadScript: (id: number) => scripts.load(id), enumTypeLoader: factory.getEnumTypeLoader(),
    windowMode: 2,
    setViewportFovValues: () => {}, setViewportZoomRange: () => {},
    getViewportFovValues: () => ({ low: 256, high: 205 }),
    getViewportZoomRange: () => ({ min: 256, max: 320 }),
    setMinimapZoom: () => {},
} as never);
manager.onLoadListener = (_id, widget) => {
    vm.runScriptEvent(createScriptEvent({ widget, args: widget.onLoad! }));
    assert.equal(vm.lastError, null);
};
manager.onSubChangeInvoker = widget => { vm.invokeEventHandler(widget, "onSubChange"); assert.equal(vm.lastError, null); };
manager.onResizeInvoker = widget => { vm.invokeEventHandler(widget, "onResize"); assert.equal(vm.lastError, null); };
manager.resize(1000, 700);
for (const root of [161, 164, 548, 161, 164]) {
    vm.context.windowMode = root === 548 ? 1 : 2;
    vars.setVarbit(4607, root === 164 ? 1 : 0);
    vars.setVarcInt(170, root === 164 ? 1 : 0);
    manager.setRootInterface(root);
    const first = root === 548 ? 81 : root === 164 ? 73 : 76;
    manager.openSubInterface((root << 16) | (first + 3), 149, 1);
    assert.equal(manager.getWidgetByUid((root << 16) | (first + 3))?.hidden, false);
    assert.equal(manager.getSubInterface((root << 16) | (first + 3))?.group, 149);
    assert.equal(manager.isEventWidgetActive(manager.getGroup(149)!.root), true);
    const otherRoot = root === 161 ? 164 : 161;
    const detached = manager.getGroup(otherRoot)!.root;
    detached.hidden = false;
    assert.equal(manager.isEventWidgetActive(detached), false, "old layout timers cannot mutate the new layout");
}
let missing = true;
const normalLoad = scripts.load.bind(scripts);
scripts.load = id => id === 907 && missing ? null : normalLoad(id);
const consumed: string[] = [];
const packets = new WidgetPacketQueue(() => manager, () => scripts, payload => {
    consumed.push(payload.action);
    if (payload.action === "set_root") manager.setRootInterface(payload.groupId);
    if (payload.action === "open_sub") manager.openSubInterface(payload.targetUid, payload.groupId, payload.type);
    if (payload.action === "set_text") manager.getWidgetByUid(payload.uid)!.text = payload.text;
});
packets.enqueue({ action: "set_root", groupId: 161 });
packets.enqueue({ action: "open_sub", targetUid: (161 << 16) | 79, groupId: 149, type: 1 });
packets.enqueue({ action: "set_text", uid: 149 << 16, text: "after mount" });
assert.deepEqual(consumed, [], "a missing nested INVOKE must not half-execute a layout change");
assert.equal(manager.rootInterface, 164, "keep the old UI while the new scripts stream");
missing = false;
packets.flush();
assert.deepEqual(consumed, ["set_root", "open_sub", "set_text"]);
assert.equal(manager.getWidgetByUid(149 << 16)!.text, "after mount");
packets.flush();
assert.equal(consumed.length, 3, "never replay applied packet side effects");
const rootWidgets = [...manager.getGroup(161)!.widgetsByUid.values()];
const subChangeScript = rootWidgets.map(w => w.eventHandlers?.onSubChange?.scriptId ?? w.onSubChange?.[0]).find(id => typeof id === "number" && id > 0)!;
assert(subChangeScript > 0);
missing = true;
scripts.load = id => id === subChangeScript && missing ? null : normalLoad(id);
packets.enqueue({ action: "open_sub", targetUid: (161 << 16) | 77, groupId: 320, type: 1 });
assert.equal(consumed.length, 3, "runtime parent tab callbacks must also be ready before mounting");
missing = false;
packets.flush();
assert.equal(consumed.length, 4);
const orb = [...manager.getGroup(160)!.widgetsByUid.values()].find(w => w.onLoad?.[0] === 446)!;
for (const status of [0, 6, 1_000_006, 0]) {
    vars.setVarp(102, status);
    vm.runScriptEvent(createScriptEvent({ widget: orb, args: orb.onLoad! }));
    assert.equal(vm.lastError, null);
    assert.equal(manager.getWidgetByUid((160 << 16) | 11)!.spriteId,
        status >= 1_000_000 ? 1102 : status > 0 ? 1061 : 1060, "native orb sprite updates and cures without reload");
}
console.log("Real-cache layout switching and ordered cold-script recovery passed");
const npcs = factory.getNpcTypeLoader();
for (const definition of FOLLOWER_ITEM_DEFINITIONS) assert(npcs.load(definition.npcTypeId).isFollower);
for (const id of [13670, 13672, 13674]) {
    const egg = npcs.load(id);
    assert.equal(egg.getIdleSeqId(factory.getBasTypeLoader()), -1);
    assert(Object.values(egg.getMovementSeqSet(factory.getBasTypeLoader())).every(id => id === -1));
}
