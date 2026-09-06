import assert from "node:assert/strict";
import { EquipmentSlot } from "@august/osrs-engine/config/player/Equipment";
import { PlayerState } from "@server/game/player";
import { NpcState } from "@server/game/npc";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { CombatHitProcessor } from "@server/game/combat/engine/CombatHitProcessor";
import { CombatHitEvaluator } from "@server/game/combat/engine/CombatHitEvaluator";
import { AttackType } from "@server/game/combat/AttackType";
import { registerSpellDataProvider } from "@server/game/spells/SpellDataProvider";
import { registerWeaponDataProvider } from "@server/game/combat/WeaponDataProvider";
import { createSpellDataProvider } from "@server/content/gamemodes/vanilla/data/spells";
import { createWeaponDataProvider } from "@server/content/gamemodes/vanilla/data/weapons";
import { createRuneDataProvider } from "@server/content/gamemodes/vanilla/data/runes";
import type { ServerServices } from "@server/game/ServerServices";
import type { CombatAttack } from "@server/game/combat/model/CombatAttack";
import type { AppliedCombatHit, PendingCombatHit } from "@server/game/combat/engine/DeferredHitQueue";
import { registerProjectileParamsProvider } from "@server/game/data/ProjectileParamsProvider";
import { createProjectileParamsProvider } from "@server/content/gamemodes/vanilla/data/projectileParams";
import { playerIsFacingNpc } from "@server/content/modules/moons-of-peril";
import { faceAngleRs } from "@august/osrs-engine/geometry";

registerSkillConfiguration({computeCombatLevel:()=>3,skillRestoreIntervalTicks:100,skillBoostDecayIntervalTicks:100,
    hitpointRegenIntervalTicks:100,hitpointOverhealDecayIntervalTicks:100,preserveDecayMultiplier:1.5});
registerWeaponDataProvider(createWeaponDataProvider());
registerProjectileParamsProvider(createProjectileParamsProvider());
const spells=createSpellDataProvider(); registerSpellDataProvider(spells);
const player=new PlayerState(1,3200,3200,0,createTestGamemode("playtest-ammo","Ammo"));
const npc=new NpcState(2,1,1,-1,-1,32,{x:3203,y:3200,level:0},{maxHitpoints:5000});
player.rot=0; player.setInteraction("npc",npc.id);
assert(playerIsFacingNpc(player,npc),"Eclipse accepts client-authoritative target facing even with stale rot");
player.resetInteractions();
const facing=faceAngleRs(player.tileX,player.tileY,npc.tileX+1,npc.tileY+1);
player.faceRot((facing+1024)&2047);
assert(!playerIsFacingNpc(player,npc),"facing away does not earn a counter");
player.faceRot(facing);
assert(playerIsFacingNpc(player,npc));
const drops: unknown[]=[];
const services={players:{getById:()=>player},npcManager:{getById:()=>npc,hasNpcOption:()=>true},
    equipmentService:{computeEquipmentStatBonuses:()=>Array(14).fill(0)}, messagingService:{queueChatMessage:()=>{}},
    variableService:{queueVarp:()=>{}},queueCombatState:()=>{},groundItems:{spawn:(...args:unknown[])=>drops.push(args)},
    broadcastService:{enqueueSpotAnimation:()=>{},queueBroadcastSound:()=>{}}} as unknown as ServerServices;
function attack(weaponId:number,type:AttackType=AttackType.Ranged,spellId?:number):CombatAttack {
    return {attacker:{type:"player",id:1},target:{type:"npc",id:2},attackClock:50,
        traits:{type,style:null,rangeTiles:10,speedTicks:5,weaponId,spellId}};
}
const previousRandom=Math.random;
try {
    Math.random=()=>0.99;
    for(const [weapon,ammo] of [[841,882],[9185,9144],[19481,19490]]) {
        player.appearance.equip[EquipmentSlot.WEAPON]=weapon;
        player.appearance.equip[EquipmentSlot.AMMO]=ammo;
        player.appearance.equipQty=Array(14).fill(0); player.appearance.equipQty[EquipmentSlot.AMMO]=2;
        const processor=new CombatHitProcessor(services);
        assert.equal(processor.processPreparedAttacks([attack(weapon)],50).processedAttacks,1);
        assert.equal(player.appearance.equipQty[EquipmentSlot.AMMO],1,"live engine consumes ammunition");
        assert.equal(processor.processPreparedAttacks([attack(weapon)],51).processedAttacks,1);
        assert.equal(player.appearance.equip[EquipmentSlot.AMMO],-1);
        assert.equal(processor.processPreparedAttacks([attack(weapon)],52).rejectedAttacks,1);
    }
    for(const cape of [10498,10499,22109]) {
        player.appearance.equip[EquipmentSlot.CAPE]=cape;
        player.appearance.equip[EquipmentSlot.AMMO]=882; player.appearance.equipQty![EquipmentSlot.AMMO]=2;
        Math.random=()=>0.79999;
        new CombatHitProcessor(services).processPreparedAttacks([attack(841)],50);
        assert.equal(player.appearance.equipQty![EquipmentSlot.AMMO],2);
        Math.random=()=>0.8;
        new CombatHitProcessor(services).processPreparedAttacks([attack(841)],50);
        assert.equal(player.appearance.equipQty![EquipmentSlot.AMMO],1);
    }
} finally {Math.random=previousRandom;}
assert.equal(spells.canWeaponAutocastSpell(30634,3291).compatible,true,"Twinflame can autocast elemental magic");
assert.equal(createWeaponDataProvider().getAttackSpeed(30634),6);
assert(createRuneDataProvider().getStaffSubstitutions().filter(s=>s.itemIds.includes(30634)).length===2);
const evaluator=new CombatHitEvaluator({resolveEntity:ref=>ref.type==="player"?player:npc,getEquipmentBonuses:()=>Array(14).fill(0),random:()=>0});
const ordinary=evaluator.evaluate(attack(1381,AttackType.Magic,3291));
const twin=evaluator.evaluate(attack(30634,AttackType.Magic,3291));
assert.equal(twin.attackRoll,Math.floor(ordinary.attackRoll*1.1));
const processor=new CombatHitProcessor(services);
const internals=processor as unknown as {queueTwinflameEcho(hit:AppliedCombatHit):void;deferredHits:{pendingHits:PendingCombatHit[]}};
const original=attack(30634,AttackType.Magic,3291);
const hit={source:player,target:npc,amount:19,hpCurrent:100,appliedClock:55,
    pending:{attack:original,maxHit:25,profileId:"test"}} as AppliedCombatHit;
internals.queueTwinflameEcho(hit);
assert.equal(internals.deferredHits.pendingHits.length,1);
const echo=internals.deferredHits.pendingHits[0];
assert.equal(echo.damage,7); assert.equal(echo.revealClock,56);
internals.queueTwinflameEcho({...hit,pending:echo});
assert.equal(internals.deferredHits.pendingHits.length,1,"echo does not recursively echo");
console.log("Live quiver consumption, Ava's 80%, Twinflame autocast/runes/accuracy and delayed echo passed");
