import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { ClientScriptLoader } from "@client/engine/cs2/ClientScriptLoader";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { Cs2Vm } from "@client/engine/cs2/Cs2Vm";
import { Script } from "@client/engine/cs2/Script";
import { state } from "@client/core/network/server-connection/state";
import { decodeClientPacket } from "@server/network/packet/ClientBinaryDecoder";
import { submitPrivateMessageInput } from "@client/features/chat/PrivateMessageInput";
const data=loadCache(loadCacheList(loadCacheInfos()).latest);
const cache=CacheSystem.fromFiles("dat2",data.files),scripts=new ClientScriptLoader({getCacheSystem:()=>cache});
const vars=new VarManager(getCacheLoaderFactory(data.info,cache).getVarBitTypeLoader());
const wm=new WidgetManager(cache),packets:Uint8Array[]=[];
(globalThis as any).WebSocket={OPEN:1};
state.socket={readyState:1,send:(p:Uint8Array)=>packets.push(p)} as any;
vars.setVarcInt(5,6);vars.setVarcString(359,"hello friend");vars.setVarcString(360,"Friend");vars.setVarbit(8119,1);
assert.equal(submitPrivateMessageInput(vars,83),false);
assert.equal(submitPrivateMessageInput(vars,84),true);
assert.deepEqual(decodeClientPacket(packets[0]),{type:"chat",payload:{messageType:"private",text:"hello friend",recipient:"Friend"}});
// Run the real native submit after pre-dispatch; only its UI-redraw helper is
// stubbed because this test has no mounted chatbox or font renderer.
const close=new Script();close.id=299;close.intArgCount=3;close.localIntCount=3;close.instructions=Int32Array.of(21);close.intOperands=Int32Array.of(0);
const vm=new Cs2Vm({widgetManager:wm,varManager:vars,loadScript:(id:number)=>id===299?close:scripts.load(id)} as never);
vm.run(scripts.load(681)!,[]);assert.equal(vm.lastError,null);
assert.equal(packets.length,1,"native callback must not double-send");
vars.setVarcInt(5,0); // The redraw stub deliberately omits the real script 299's mode reset.
assert.equal(submitPrivateMessageInput(vars,84),false);
vars.setVarcInt(5,2);vars.setVarcString(359,"not a private message");
assert.equal(submitPrivateMessageInput(vars,84),false,"friend-name/other prompts stay native");
wm.getGroup(12);assert.equal(wm.getWidgetByUid((12<<16)|42)?.spriteId,1041,"native bank deposit icon");
wm.getGroup(161);assert.equal(wm.getWidgetByUid((161<<16)|53)?.spriteId,907,"native inventory tab icon");
console.log("Private prompt -> real wire packet -> native submit, exactly once, passed");
