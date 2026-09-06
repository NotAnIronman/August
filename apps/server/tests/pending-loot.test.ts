import assert from "node:assert/strict";
import { PlayerInventoryState } from "@server/game/state/PlayerInventoryState";
import { PlayerMoonState } from "@server/game/state/PlayerMoonState";
import { PlayerCollectionLogState } from "@server/game/state/PlayerCollectionLogState";
import { sanitizePendingLoot } from "@server/game/state/PlayerLootState";
import { mergePlayerPersistentVars } from "@server/game/state/PlayerPersistence";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { registerRewardDisplayActions } from "@server/content/gamemodes/vanilla/widgets/rewardDisplay";
import { reopenPendingLoot, storePendingLoot } from "@server/content/gamemodes/vanilla/widgets/pendingLoot";
import { REWARD_DISPLAY_PANEL_GROUP_ID as GROUP } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
const p:any={id:1,pendingLoot:[],items:new PlayerInventoryState(),moons:new PlayerMoonState(),
    collectionLog:new PlayerCollectionLogState(),canInteract:()=>true};
p.items.setItemDefResolver(()=>({stackable:false}));
let saved:any,fail=false;
const events:any[]=[];
const services:any={appearance:{savePlayerSnapshotChecked:()=>{
    if(fail)throw Error('disk full');saved=structuredClone({pendingLoot:p.pendingLoot,moonProgress:p.moons.serialize()});
}},inventory:{snapshotInventory(){}},collectionLog:{trackCollectionLogItem(){},sendCollectionLogSnapshot(){}},
    banking:{addItemToBank:(_p:any,id:number,quantity:number)=>{p.items.bank.push({itemId:id,quantity});return true;}},
    system:{logger:{error(){}}},messaging:{sendGameMessage(){}},dialog:{queueWidgetEvent:(_id:number,e:any)=>events.push(e),
        closeModal:()=>p.modal=undefined,getInterfaceService:()=>({isModalOpen:()=>p.modal===GROUP,openModal:()=>p.modal=GROUP})}};
const registry=new ScriptRegistry();registerRewardDisplayActions(registry);
const click=(id:number,op=1)=>registry.findWidgetAction((GROUP<<16)|id,op)?.({player:p,services} as any);
p.moons.defeated.add('blue');
assert(storePendingLoot(p,services,'lunar',[{itemId:4151,quantity:30}],()=>p.moons.defeated.clear()));
assert.equal(p.items.getInventoryEntries().filter((i:any)=>i.itemId>0).length,0,'opening never pre-awards loot');
assert.equal(saved.moonProgress,0);assert.equal(saved.pendingLoot[0].items[0].quantity,30);
assert(!storePendingLoot(p,services,'lunar',[{itemId:995,quantity:999}],()=>assert.fail('reroll')));
click(852);assert.equal(p.pendingLoot[0].items[0].quantity,2,'claim available inventory space only');
assert.equal(p.items.getInventoryEntries().filter((i:any)=>i.itemId===4151).length,28);
p.pendingLoot=sanitizePendingLoot(saved.pendingLoot);
assert(reopenPendingLoot(p,services,'lunar'));
fail=true;click(854);assert.equal(p.pendingLoot[0].items[0].quantity,2);assert.equal(p.items.bank.length,0,'failed save rolls back bank');
fail=false;click(1001,2);assert.equal(p.pendingLoot.length,0);assert.equal(p.items.bank[0].quantity,2);
click(1001,2);assert.equal(p.items.bank[0].quantity,2,'stale window cannot duplicate claims');
assert.deepEqual(saved.pendingLoot,[]);
assert.deepEqual(mergePlayerPersistentVars({pendingLoot:[{source:'lunar',items:[{itemId:4151,quantity:2}]}]},{pendingLoot:[]})?.pendingLoot,[]);
assert.deepEqual(sanitizePendingLoot([{source:'lunar',items:[{itemId:4151,quantity:-1}]}]),[]);
fail=true;p.moons.defeated.add('blue');
assert(!storePendingLoot(p,services,'lunar',[{itemId:4151,quantity:1}],()=>p.moons.defeated.clear()));
assert(p.moons.defeated.has('blue'));assert.equal(p.pendingLoot.length,0);
assert(events.some(e=>e.action==='set_hidden'&&e.uid===((GROUP<<16)|852)&&e.hidden===false));
console.log('Deferred loot, partial/individual claims, restart, rollback and stale clicks passed');
