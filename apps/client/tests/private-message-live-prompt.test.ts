import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { ClientScriptLoader } from "@client/engine/cs2/ClientScriptLoader";
import { Cs2Vm } from "@client/engine/cs2/Cs2Vm";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { state } from "@client/core/network/server-connection/state";
import { submitPrivateMessageInput } from "@client/features/chat/PrivateMessageInput";
const data=loadCache(loadCacheList(loadCacheInfos()).latest),cache=CacheSystem.fromFiles("dat2",data.files);
const vars=new VarManager(getCacheLoaderFactory(data.info,cache).getVarBitTypeLoader());
const wm=new WidgetManager(cache),scripts=new ClientScriptLoader({getCacheSystem:()=>cache});
const vm=new Cs2Vm({widgetManager:wm,varManager:vars,loadScript:(id:number)=>scripts.load(id),
    getTextWidth:(s:string)=>s.length*6,splitTextLines:(s:string)=>[s]} as never);
const packets:Uint8Array[]=[];(globalThis as any).WebSocket={OPEN:1};state.socket={readyState:1,send:(p:Uint8Array)=>packets.push(p)} as any;
wm.getGroup(162);vars.setVarbit(8119,1);
vm.run(scripts.load(107)!,[],["Friend"]);assert.equal(vm.lastError,null);
assert.equal(vars.getVarcInt(5),6);assert.equal(vars.getVarcString(360),"Friend");
for(const ch of 'hello') {vm.run(scripts.load(112)!,[-1,ch.charCodeAt(0)],[""]);assert.equal(vm.lastError,null);}
assert.equal(vars.getVarcString(359),"hello");
vm.privateChatMode=2;
assert.equal(submitPrivateMessageInput(vars,84),true);
vm.run(scripts.load(112)!,[84,0],[""]);assert.equal(vm.lastError,null);
assert.equal(packets.length,1);
assert.equal(vm.privateChatMode,1,"Sending must enable Private chat instead of silently hiding the echo");
console.log('Actual friend prompt / typing / Enter passed');
