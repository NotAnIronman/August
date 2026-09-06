import assert from "node:assert/strict";
import { handleInboundUi } from "@client/core/network/server-connection/handlers/inboundUi";
import { state } from "@client/core/network/server-connection/state";
import { alignPosition } from "@client/ui/widgets/layout/WidgetLayout";
import { GroundItemsPlugin } from "@client/features/plugins/grounditems/GroundItemsPlugin";
import { groundItemEditControls,clickGroundItemEdit } from "@client/features/plugins/grounditems/GroundItemEditControls";
import { updateGroundItemMeshes,hashGroundStacks } from "@client/engine/rendering/render/draw3";
import { getPreferredMapForWorldTile } from "@client/engine/rendering/render/interact/menu";
import { MapManager } from "@client/engine/game/MapManager";
import { serverEncoder } from "@server/network/packet/ServerBinaryEncoder";
import { decodeServerPacket } from "@client/core/network/packet/ServerBinaryDecoder";
import { BOSS_ROOMS } from "@server/content/modules/guardians-gryphon/rooms";

assert.deepEqual(BOSS_ROOMS[0].outside,{x:3427,y:3541,level:2});

// Actual inbound dispatch must retain collection slots beyond backpack capacity.
const slots=Array.from({length:100},(_,slot)=>({slot,itemId:slot===60?28801:slot===61?28798:1000+slot,quantity:slot+1}));
handleInboundUi({type:"collection_log",payload:{kind:"snapshot",slots}});
assert.deepEqual(state.lastCollectionLogSnapshot,slots);
handleInboundUi({type:"inventory",payload:{kind:"snapshot",slots:[{slot:99,itemId:995,quantity:1}]}});
assert.equal(state.lastInventorySnapshot?.[0].slot,27,"backpack guard remains unchanged");

const notification={rawX:0,rawY:10,width:178,height:100,x:0,y:0,xPositionMode:1,yPositionMode:0,layoutOffsetY:100};
for(let i=0;i<3;i++){alignPosition(notification,800,600);assert.equal(notification.y,110,"offset never accumulates");}
notification.rawY=20;alignPosition(notification,800,600);assert.equal(notification.y,120,"survives CS2 positioning");

const plugin=new GroundItemsPlugin();
plugin.setConfig({hiddenItems:"",highlightedItems:""});
groundItemEditControls.apply=(name,list)=>plugin.toggleItemList(name,list);
for(const list of ["hide","highlight"] as const)for(const scale of [1,1.5,2]){
 groundItemEditControls.hits=[{x:100,y:120,width:30,height:20,name:"Coins",list}];
 assert(clickGroundItemEdit(110/scale,130/scale,scale,scale));
 assert(plugin.hasExactItemListEntry("Coins",list));
 assert(clickGroundItemEdit(110/scale,130/scale,scale,scale));
 assert(!plugin.hasExactItemListEntry("Coins",list),"second rendered control click removes exact list entry");
}
groundItemEditControls.hits=[];groundItemEditControls.apply=undefined;

// Shellbane's instance mesh has a different resource key from its drop tile.
const map:any={mapX:50,mapY:139,getRenderBaseTileX:()=>3152,getRenderBaseTileY:()=>8848,getLocalTileSpan:()=>104,delete(){}};
const manager=new MapManager<any>(1,()=>{});manager.addMap(50,139,map);
const built:any[]=[];
const host:any={mapManager:manager,groundItemStacks:new Map(),groundItemStackHashes:new Map(),
 getControlledPlayerWorldViewId:()=>4000,osrsClient:{worldViewManager:{getWorldView:()=>undefined,findWorldViewAt:()=>undefined}},
 rebuildGroundItemsForMap:(m:any,s:any)=>{built.push({m,s});return false;}};
host.getPreferredMapForWorldTile=(x:number,y:number)=>getPreferredMapForWorldTile(host,x,y);
host.hashGroundStacks=(s:any)=>hashGroundStacks(host,s);
const drop:any={id:1,itemId:995,quantity:100,tile:{x:3179,y:8872,level:0}};
updateGroundItemMeshes(host,[drop]);
assert.equal(built[0].m,map,"ground mesh uses the same instance height data as terrain");
assert.deepEqual(built[0].s,[drop]);
updateGroundItemMeshes(host,[]);assert.deepEqual(built[1].s,[],"pickup clears the correct mesh");

for(const rotation of [undefined,0,1,2,3]){
 const packet=serverEncoder.encodeLocChange(11388,11393,{x:3020,y:9700},0,rotation,rotation);
 const decoded=decodeServerPacket(packet) as any;
 assert.equal(decoded.payload.oldRotation,rotation);
 assert.equal(decoded.payload.newRotation,rotation,"wire retains unchanged orientation separately from west");
}
console.log("Collection quantities, notification layout, two-way scaled toggles, instance drop routing and rotation packets passed");
