import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { registerDrakansMedallionHandlers, DRAKANS_DESTINATIONS } from "@server/content/gamemodes/vanilla/scripts/items/drakansMedallion";

const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const cache = CacheSystem.fromFiles("dat2", data.files);
const medallion = getCacheLoaderFactory(data.info,cache).getObjTypeLoader().load(22400);
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
console.log("Drakan's medallion: cache options, all three inventory/worn destinations and ownership/restriction checks passed");
