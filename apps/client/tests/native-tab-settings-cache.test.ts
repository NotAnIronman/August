import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { ClientScriptLoader } from "@client/engine/cs2/ClientScriptLoader";
import { Cs2Vm } from "@client/engine/cs2/Cs2Vm";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { WidgetActionRouter } from "@client/engine/game/widgets/WidgetActionRouter";

const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const cache = CacheSystem.fromFiles("dat2", data.files);
const factory = getCacheLoaderFactory(data.info, cache);
const vars = new VarManager(factory.getVarBitTypeLoader());
const scripts = new ClientScriptLoader({ getCacheSystem: () => cache });
const manager = new WidgetManager(cache);
manager.getGroup(121);
const vm = new Cs2Vm({ widgetManager: manager, varManager: vars, loadScript: (id: number) => scripts.load(id), enumTypeLoader: factory.getEnumTypeLoader() } as never);
const router = new WidgetActionRouter({ getWidgetManager: () => manager, getVarManager: () => vars } as never);
const uid = (child: number) => (121 << 16) | child;
const expectedTabs = [0,1,2,3,4,5,6,9,8,10,11,12,7,13];
for (let row = 0; row < 14; row++) {
    const widget = manager.getWidgetByUid(uid(9 + row * 7));
    router.prepareClientSettingAction({ widget, option: "Choose", source: "primary" });
    // Execute the actual cache script that creates the dropdown children.
    vm.run(scripts.load(982)!, [uid(108),uid(107),uid(111),uid(112)]);
    assert.equal(vm.lastError, null);
    const key = (row % 12) + 1;
    const choice = manager.getWidgetByUid(uid(111))?.children?.[key];
    assert(choice, `native dropdown must contain F${key}`);
    const commit = router.prepareClientSettingAction({ widget: choice, option: "Select", source: "primary" });
    assert.equal(commit?.(), true);
    // The native key dispatcher must resolve the newly saved value to the correct tab.
    vm.run(scripts.load(986)!, [key]);
    assert.equal(vm.lastError, null);
    assert.equal(vm.intStack[0], expectedTabs[row], `row ${row} key F${key} must target its tab`);
}
console.log("Real cache dropdown -> saved binding -> native key-to-tab dispatch passed");
