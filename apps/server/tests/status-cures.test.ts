import assert from "node:assert/strict";
import { PlayerState } from "@server/game/player";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { registerStatusCures } from "@server/content/gamemodes/vanilla/skills/consumables/statusCures";
import { HEALTH_ORB_CURE_WIDGETS } from "@august/protocol/ui/healthOrb";
registerSkillConfiguration({ computeCombatLevel: () => 3, skillRestoreIntervalTicks: 100,
    skillBoostDecayIntervalTicks: 100, hitpointRegenIntervalTicks: 100,
    hitpointOverhealDecayIntervalTicks: 100, preserveDecayMultiplier: 1.5 });
const p = new PlayerState(997,3200,3200,0,createTestGamemode("cures","Cures"));
const s = p.skillSystem;
s.inflictVenom(6,0);
const hits: number[] = [];
for (let tick = 30; tick <= 270; tick += 30) {
    p.status.hitpointsCurrent = 1000;
    hits.push(s.processVenom(tick)!.amount);
}
assert.deepEqual(hits,[6,8,10,12,14,16,18,20,20]);
assert.equal(s.takeHealthOrbTimerSync(270,600)?.[2],-1);
s.reduceVenomOrCurePoison(270);
assert.equal(p.status.venomEffect,undefined);
assert.equal(p.status.poisonEffect?.potency,20);
s.reduceVenomOrCurePoison(270);
assert.equal(p.status.poisonEffect,undefined);
s.inflictPoison(2,300);
assert.deepEqual(s.takeHealthOrbTimerSync(300,600),[0,18,180]);
const poison: number[] = [];
for (let tick = 330; tick <= 600; tick += 30) { p.status.hitpointsCurrent = 1000; poison.push(s.processPoison(tick)!.amount); }
assert.deepEqual(poison,[2,2,2,2,2,1,1,1,1,1]);
assert.equal(p.status.poisonEffect,undefined);
assert.deepEqual(s.takeHealthOrbTimerSync(600,600),[0,0,0]);
const widgetHandlers = new Map<number,(e: any) => void>();
const items = new Map<number,(e: any) => void>();
const pending: any[] = [];
const messages: string[] = [];
const services: any = { system: { tickMs:600, getTickMs:()=>600, logger:{warn(){}} },
    dialog:{closeInterruptibleInterfaces(){}}, animation:{playPlayerSeq(){}},
    messaging:{sendGameMessage: (_p: unknown,text: string)=>messages.push(text)},
    inventory:{setInventorySlot: (_p: unknown,slot: number,itemId: number,quantity: number)=>{p.items.getInventoryEntries()[slot]={itemId,quantity};}},
    combat:{requestAction: (_p: unknown,a: any)=>{pending.push(a);return {ok:true};}} };
registerStatusCures({registerItemAction:(id: number,h: any)=>items.set(id,h),registerWidgetAction:(o: any)=>widgetHandlers.set(o.widgetId,o.handler)} as never,services);
p.items.getInventoryEntries()[0]={itemId:2446,quantity:1};
p.items.getInventoryEntries()[1]={itemId:12905,quantity:1};
s.inflictVenom(12,700);
widgetHandlers.get(HEALTH_ORB_CURE_WIDGETS[0])!({player:p,tick:700});
assert.equal(pending[0].data.itemId,12905,"orb prefers full venom cure");
pending.shift().data.apply();
assert.equal(p.items.getInventoryEntries()[1].itemId,12907,"one dose consumed");
assert.equal(p.status.venomEffect,undefined);
s.inflictVenom(6,701); assert.equal(p.status.venomEffect,undefined,"anti-venom immunity works");
s.inflictVenom(14,2000);
items.get(2446)!({player:p,source:{slot:0},tick:2000}); pending.shift().data.apply();
assert.equal(p.status.venomEffect,undefined);
assert.equal(s.getPendingPoisonOrVenomDamage(),14);
assert.equal(p.items.getInventoryEntries()[0].itemId,175);
for (const entry of p.items.getInventoryEntries()) {entry.itemId=-1;entry.quantity=0;}
widgetHandlers.get(HEALTH_ORB_CURE_WIDGETS[1])!({player:p,tick:2010});
assert.match(messages.at(-1)!,/don't have/);
assert.equal(pending.length,0,"missing cure must not enqueue or consume anything");
console.log("Venom curve, finite poison, cure downgrade, orb dose selection and immunity passed");
