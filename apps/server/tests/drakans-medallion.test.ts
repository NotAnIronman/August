import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { registerBinaryHandlers } from "@server/network/handlers/binaryMessageHandlers";
import { registerEquipmentWidgetHandlers } from "@server/content/gamemodes/vanilla/equipment/equipmentWidgets";
import { PacketBuffer } from "@client/core/network/packet/PacketBuffer";
import { parsePacketsAsMessages, OsrsClientPacketId } from "@server/network/packet/PacketHandler";
import { registerDrakansMedallionHandlers, DRAKANS_DESTINATIONS } from "@server/content/gamemodes/vanilla/scripts/items/drakansMedallion";
import { registerToxicBlowpipeHandlers } from "@server/content/gamemodes/vanilla/scripts/items/toxicBlowpipe";

const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const cache = CacheSystem.fromFiles("dat2", data.files);
const objTypes = getCacheLoaderFactory(data.info,cache).getObjTypeLoader();
const medallion = objTypes.load(22400);
assert.equal(medallion.name,"Drakan's medallion");
assert.deepEqual(DRAKANS_DESTINATIONS,[
    {option:"Ver Sinhaza",x:3649,y:3230,level:0},
    {option:"Slepe",x:3808,y:9754,level:1},
    {option:"Darkmeyer",x:3605,y:3362,level:0},
],"destinations match the authored Theatre setup coordinates");
const registry = new ScriptRegistry();
registerDrakansMedallionHandlers(registry);
const requests: any[] = [];
const messages: string[] = [];
let inventory = [{itemId:22400,quantity:1}];
let equipped = 22400;
let rejection: string | undefined;
const services: any = {
    inventory: {getInventoryItems: () => inventory},
    equipment: {getEquippedItem: () => equipped},
    movement: {requestTeleportAction: (_p: unknown,request: any) => {
        requests.push(request); return rejection ? {ok:false,reason:rejection} : {ok:true};
    }},
    messaging: {sendGameMessage: (_p: unknown,message: string) => messages.push(message)},
};
for (const destination of DRAKANS_DESTINATIONS) {
    assert(medallion.inventoryActions.includes(destination.option),"destination is available from inventory");
    assert([451,452,453].some(id => medallion.params?.get(id) === destination.option),"destination is available while worn");
    const event: any = {player:{id:1}, services, tick:1, source:{slot:0,itemId:22400}, target:{slot:-1,itemId:-1}};
    const inventoryAction = registry.findItemAction(22400,destination.option.toLowerCase())!;
    const equippedAction = registry.findEquipmentAction(22400,destination.option.toLowerCase())!;
    assert(inventoryAction); assert(equippedAction);
    inventoryAction(event);
    equippedAction({...event,slot:2,itemId:22400,option:destination.option.toLowerCase()});
    assert.equal(requests.length,2,"both inventory and worn actions must request a teleport");
    for (const request of requests.splice(0)) {
        assert.deepEqual([request.x,request.y,request.level],[destination.x,destination.y,destination.level]);
        assert.equal(request.requireCanTeleport,true);
        assert.equal(request.rejectIfPending,true);
        assert.equal(request.replacePending,false);
    }
    assert.equal(inventory[0].quantity,1,"teleport does not consume the medallion");
    inventory = []; equipped = -1;
    inventoryAction(event);
    equippedAction({...event,slot:2,itemId:22400,option:destination.option.toLowerCase()});
    assert.equal(requests.length,0,"stale inventory/equipment clicks cannot teleport");
    inventory = [{itemId:22400,quantity:1}]; equipped = 22400;
    inventoryAction({...event,source:{slot:28,itemId:22400}});
    inventoryAction({...event,source:{slot:0,itemId:1}});
    assert.equal(requests.length,0,"invalid source slots and items cannot teleport");
    inventory[0].quantity = 0;
    inventoryAction(event);
    assert.equal(requests.length,0,"empty inventory entry cannot teleport");
    inventory[0].quantity = 1;
    rejection = "cannot_teleport";
    inventoryAction(event);
    assert.match(messages.at(-1)!,/magical force/);
    requests.length = 0; rejection = undefined;
}
assert.equal(registry.findItemAction(22400,"drop"),undefined,"normal Drop is not intercepted");
assert.equal(registry.findItemAction(22400,"wear"),undefined,"normal Wear is not intercepted");
assert.equal(registry.findItemAction(22400),undefined,"no wildcard teleport action");
// Exercise the actual binary IF_BUTTON route, not just the leaf item handlers.
const packets = new Map<string,(event:any)=>void>();
const player = {id:1, equipment:{getBlowpipeChargeState:()=>({scales:123,dartCount:45,dartId:806})}};
let removals=0;
services.system={logger:{info:()=>{}}};
services.data={getObjType:(id:number)=>objTypes.load(id)};
services.equipment.getEquipArray=()=>[-1,-1,equipped];
services.equipment.unequipItem=()=>{removals++;return true;};
services.equipment.performItemAction=(_p:any,slot:number,itemId:number,option:string)=>{
    const handler=registry.findEquipmentAction(itemId,option.toLowerCase());
    handler?.({player,slot,itemId,option,services,tick:1} as any);
    return !!handler;
};
registerEquipmentWidgetHandlers(registry,services);
const runtime = {getServices:()=>services,queueItemAction:(event:any)=>{
    const handler=registry.findItemAction(event.itemId,event.option);
    handler?.({...event,services,source:{slot:event.slot,itemId:event.itemId}});
    return !!handler;
}};
registerBinaryHandlers({register:(name:string,handler:any)=>packets.set(name,handler)} as any,{
    getPlayer:()=>player,getCurrentTick:()=>1,getObjType:()=>medallion,
    handleFriendsChatWidgetAction:()=>false,getScriptRegistry:()=>registry,getScriptRuntime:()=>runtime,
    getCs2ModalManager:()=>({handleWidgetAction:()=>false}),
    getWidgetDialogHandler:()=>({handleWidgetActionMessage:()=>{}}),
} as any);
const click=(group:number,component:number,opId:number,itemId=group === 149 ? 22400 : -1)=>{
    const opcodes=[0,OsrsClientPacketId.IF_BUTTON1,OsrsClientPacketId.IF_BUTTON2,OsrsClientPacketId.IF_BUTTON3,
        OsrsClientPacketId.IF_BUTTON4,OsrsClientPacketId.IF_BUTTON5,OsrsClientPacketId.IF_BUTTON6,
        OsrsClientPacketId.IF_BUTTON7,OsrsClientPacketId.IF_BUTTON8,OsrsClientPacketId.IF_BUTTON9,OsrsClientPacketId.IF_BUTTON10];
    const wire=new PacketBuffer(9);
    wire.writeByte(opcodes[opId]); wire.writeInt((group<<16)|component);
    wire.writeShort(group === 149 ? 0 : -1); wire.writeShort(itemId);
    const decoded=parsePacketsAsMessages(wire.data)[0].msg!;
    assert.equal(decoded.type,"widget_action");
    if(itemId === -1) assert.equal((decoded.payload as any).itemId,65535,"worn containers use an unsigned sentinel on the wire");
    packets.get("widget_action")!({ws:{},payload:decoded.payload});
};
for(const [op,name] of [[3,"Ver Sinhaza"],[4,"Darkmeyer"],[6,"Slepe"]] as const) {
    click(149,0,op);
    const dest: typeof DRAKANS_DESTINATIONS[number]=DRAKANS_DESTINATIONS.find(d=>d.option===name)!;
    assert.deepEqual(requests.splice(0).map(r=>[r.x,r.y,r.level]),[[dest.x,dest.y,dest.level]]);
}
for(const [group,component] of [[387,17],[84,12]]) {
    for(const [op,name] of [[2,"Ver Sinhaza"],[3,"Darkmeyer"],[4,"Slepe"]] as const) {
        click(group,component,op);
        const dest: typeof DRAKANS_DESTINATIONS[number]=DRAKANS_DESTINATIONS.find(d=>d.option===name)!;
        assert.deepEqual(requests.splice(0).map(r=>[r.x,r.y,r.level]),[[dest.x,dest.y,dest.level]]);
        assert.equal(removals,0,"worn teleports never unequip");
    }
    click(group,component,10); click(group,component,2,4151);
    assert.equal(requests.length,0,"examine and stale item IDs cannot teleport");
}
click(387,17,1); assert.equal(removals,1,"Remove still unequips");
// Every equipment slot, including slots whose cache worn index differs from
// our internal index, uses an item-less container button.
const removedSlots:number[]=[];
services.equipment.unequipItem=(_p:unknown,slot:number)=>{removedSlots.push(slot);return true;};
for(const group of [387,84]) {
    for(let slot=0;slot<11;slot++) click(group,(group === 387 ? 15 : 10)+slot,1);
}
assert.deepEqual(removedSlots,[...Array(11).keys(),...Array(11).keys()]);
equipped=-1;click(387,15,1);assert.equal(removedSlots.length,22,"empty slots cannot unequip a nonexistent item");equipped=22400;
// A non-teleport worn operation must reach its actual effect, too.
registerToxicBlowpipeHandlers(registry,services);
equipped=12926;
const checkOp=Array.from({length:8},(_,i)=>i+2).find(op=>objTypes.load(equipped).params?.get(449+op)==="Check");
assert.notEqual(checkOp,undefined,"the real blowpipe cache defines a worn Check operation");
for(const [group,component] of [[387,18],[84,13]]) {
    click(group,component,checkOp!);
    assert.equal(messages.at(-1),"Your toxic blowpipe contains 123 scales and 45 darts.");
    messages.length=0;
}
assert.equal(removedSlots.length,22,"operating a weapon must not unequip it");
equipped=22400;
for(const op of [1,2,5,7,10]) click(149,0,op);
assert.equal(requests.length,0,"reserved, Wear, Drop and Examine operations never teleport");
console.log("Drakan's medallion: cache options, all three inventory/worn destinations and ownership/restriction checks passed");
