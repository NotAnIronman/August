import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { ClientScriptLoader } from "@client/engine/cs2/ClientScriptLoader";
import { Cs2Vm } from "@client/engine/cs2/Cs2Vm";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { getCompactLayoutSelection } from "@client/engine/game/widgets/CompactLayoutSettings";
const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const cache = CacheSystem.fromFiles("dat2", data.files);
const scripts = new ClientScriptLoader({ getCacheSystem: () => cache });
const factory = getCacheLoaderFactory(data.info, cache);
const vars = new VarManager(factory.getVarBitTypeLoader());
const manager = new WidgetManager(cache);
manager.getGroup(116);
const vm = new Cs2Vm({
    widgetManager: manager, varManager: vars,
    loadScript: (id: number) => scripts.load(id),
    enumTypeLoader: factory.getEnumTypeLoader(),
    windowMode: 2,
} as never);
const uid = (child: number) => (116 << 16) | child;
const modes: number[] = [];

function dropdown() {
    const anchor = manager.getWidgetByUid(uid(1))!;
    vm.run(scripts.load(4568)!, [
        uid(1), uid(39), uid(38), uid(40), uid(41), uid(2),
        anchor.parentUid, 3509, 12, 0,
    ]);
    assert.equal(vm.lastError, null);
    return manager.getWidgetByUid(uid(39))!.children!;
}
function readLayout() {
    vm.run(scripts.load(3962)!, [12]);
    assert.equal(vm.lastError, null);
    return vm.intStack[0];
}

// Reproduce the user's trace: direct native onOp, without WidgetActionRouter.
const before = dropdown()[1];
assert(before);
assert.equal(before.eventHandlers?.onOp?.scriptId, 4569);
assert.equal(vm.invokeEventHandler(before, "onOp", { opIndex: 1 }), true);
assert.equal(readLayout(), 1, "unbridged native compact selection snaps back to classic resizable");

vm.context.prepareWidgetEvent = (widget, type, event) => {
    const mode = getCompactLayoutSelection(widget, type, event);
    if (mode === undefined) return undefined;
    return () => {
        modes.push(mode);
        vm.context.windowMode = mode === 0 ? 1 : 2;
        vm.context.defaultWindowMode = mode === 0 ? 1 : 2;
        vars.setVarbit(4607, mode === 2 ? 1 : 0);
    };
};

for (const mode of [0, 2, 1]) {
    const choice = dropdown()[mode + 1];
    assert(choice);
    assert.equal(getCompactLayoutSelection(choice, "onOp", { opIndex: 1 }), mode);
    assert.equal(getCompactLayoutSelection(choice, "onClick", { opIndex: 1 }), undefined);
    assert.equal(getCompactLayoutSelection(choice, "onOp", { opIndex: 2 }), undefined);
    assert.equal(vm.invokeEventHandler(choice, "onOp", { opIndex: 1 }), true);
    assert.equal(vm.lastError, null);
    assert.equal(readLayout(), mode, "native refresh must retain the chosen mode");
}
assert.deepEqual(modes, [0, 2, 1], "one authoritative request per selection");

// Cache-loaded legacy listeners must take the same bridge as compiled listeners.
const legacy = dropdown()[1];
assert(legacy);
legacy.eventHandlers = {};
assert.equal(getCompactLayoutSelection(legacy, "onOp", { opIndex: 1 }), 0);
assert.equal(vm.invokeEventHandler(legacy, "onOp", { opIndex: 1 }), true);
assert.equal(readLayout(), 0);

const unrelated = dropdown()[2];
assert(unrelated);
const args = unrelated.eventHandlers!.onOp!.intArgs;
args[7] = 45;
assert.equal(getCompactLayoutSelection(unrelated, "onOp", { opIndex: 1 }), undefined, "other settings must be ignored");
args[7] = 12;
args[6] = 999;
assert.equal(getCompactLayoutSelection(unrelated, "onOp", { opIndex: 1 }), undefined, "wrong enum must be ignored");
console.log("Compact native dropdown: reproduced reset, all three modes retain selection, legacy listeners and shared-setting guards passed");
