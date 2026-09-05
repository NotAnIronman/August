import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { Inventory } from "@august/osrs-engine/inventory/Inventory";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { ClientScriptLoader } from "@client/engine/cs2/ClientScriptLoader";
import { Cs2Vm, createScriptEvent } from "@client/engine/cs2/Cs2Vm";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";

const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const cache = CacheSystem.fromFiles("dat2",data.files);
const factory = getCacheLoaderFactory(data.info,cache);
const scripts = new ClientScriptLoader({getCacheSystem:()=>cache});
const manager = new WidgetManager(cache);
const inv = new Inventory();
const worn = new Inventory(14);
inv.setSlot(0,22400,1);
worn.setSlot(2,22400,1);
const vm = new Cs2Vm({widgetManager:manager,varManager:new VarManager(factory.getVarBitTypeLoader()),
    loadScript:(id:number)=>scripts.load(id),objTypeLoader:factory.getObjTypeLoader(),
    paramTypeLoader:factory.getParamTypeLoader(),enumTypeLoader:factory.getEnumTypeLoader(),
    getTextWidth:(text:string)=>text.length*6,getTextHeight:()=>12,splitTextLines:(text:string)=>[text],
    inventories:new Map([[93,inv],[94,worn]])} as never);
manager.onLoadListener = (_id,widget)=>{
    vm.runScriptEvent(createScriptEvent({widget,args:widget.onLoad!}));
    assert.equal(vm.lastError,null);
};
for (const id of [149,387,84]) {
    const group = manager.getGroup(id)!;
    for (const widget of group.widgetsByUid.values()) {
        if (widget.onLoad) {
            vm.runScriptEvent(createScriptEvent({widget,args:widget.onLoad}));
            assert.equal(vm.lastError,null);
        }
    }
    for (const widget of group.widgetsByUid.values()) {
        if (widget.onInvTransmit) {
            vm.runScriptEvent(createScriptEvent({widget,args:widget.onInvTransmit}));
            assert.equal(vm.lastError,null);
        }
    }
    if (id === 149) {
        const actions = manager.getWidgetByUid(149 << 16)!.children![0]!.actions!;
        assert.deepEqual([2,3,4,6,7,10].map(op=>actions[op-1]),
            ["Wear","Ver Sinhaza","Darkmeyer","Slepe","Drop","Examine"]);
        assert(!actions[0] && !actions[4],"reserved operation slots must not shift item actions");
    } else {
        const component = id === 387 ? 17 : 12;
        const actions = manager.getWidgetByUid((id << 16) | component)!.actions!;
        assert.deepEqual([1,2,3,4,10].map(op=>actions[op-1]),
            ["Remove","Ver Sinhaza","Darkmeyer","Slepe","Examine"]);
    }
}
console.log("Medallion native inventory, equipment tab and equipment stats operation slots passed");
