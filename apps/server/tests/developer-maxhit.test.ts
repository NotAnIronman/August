import assert from "node:assert/strict";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import { AttackType } from "@server/game/combat/AttackType";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { CombatHitEvaluator } from "@server/game/combat/engine/CombatHitEvaluator";
import { npcCombatEntityRef, playerCombatEntityRef } from "@server/game/combat/model/CombatEntityRef";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { setDeveloperMaxHitEnabled, isDeveloperMaxHitEnabled, setDeveloperInstakillEnabled, isDeveloperInstakillEnabled } from "@server/game/dev/DeveloperFlags";
import { findBuiltinCommand, listBuiltinCommandsForPermission } from "@server/game/commands/BuiltinCommandCatalog";
import { DeferredHitQueue, DeferredHitsplatType } from "@server/game/combat/engine/DeferredHitQueue";
registerSkillConfiguration({ computeCombatLevel:()=>3,skillRestoreIntervalTicks:100,skillBoostDecayIntervalTicks:100,
    hitpointRegenIntervalTicks:100,hitpointOverhealDecayIntervalTicks:100,preserveDecayMultiplier:1.5 });
const player=new PlayerState(10,3200,3200,0,createTestGamemode("maxhit","Maxhit"));
for(const skill of [SkillId.Attack,SkillId.Strength,SkillId.Ranged,SkillId.Magic]) player.skillSystem.setSkillBoost(skill,99);
const npc=new NpcState(20,8360,6,-1,-1,32,{x:3201,y:3200,level:0},{maxHitpoints:3500});
const evaluator=new CombatHitEvaluator({resolveEntity:ref=>ref.id===10?player:npc,getEquipmentBonuses:()=>Array(14).fill(0),random:()=>0.999999});
const attack=(type:AttackType)=>({attacker:playerCombatEntityRef(10),target:npcCombatEntityRef(20),attackClock:1,
    traits:{type,style:null,speedTicks:4,rangeTiles:10,maxHitOverride:40}});
assert(!isDeveloperMaxHitEnabled(player));
assert.equal(findBuiltinCommand("maxhit")?.permission,"developer");
assert(!listBuiltinCommandsForPermission("player").some(c=>c.name==="maxhit"));
setDeveloperInstakillEnabled(player,true);
setDeveloperMaxHitEnabled(player,true);
assert(!isDeveloperInstakillEnabled(player),"maxhit turns off instakill");
for(const type of [AttackType.Melee,AttackType.Ranged,AttackType.Magic]) {
    const hit=evaluator.evaluate(attack(type));
    assert(hit.landed);assert.equal(hit.damage,hit.maxHit);assert(hit.maxHit>1 && hit.maxHit<9999);
    const special=evaluator.evaluateSpecialAttack(attack(type),{energyCostPercent:50,hitCount:2,accuracyMultiplier:1,damageMultiplier:1.5,maximumDamageCap:60});
    assert.equal(special.length,2);
    for(const part of special){assert(part.landed);assert.equal(part.damage,part.maxHit);assert(part.damage<=60);}
}
const queue=new DeferredHitQueue({resolveEntity:ref=>ref.id===10?player:npc});
npc.incomingPlayerDamageMultiplier=0.5;npc.incomingPlayerDamageCap=1;
const roll=evaluator.evaluate(attack(AttackType.Melee));
queue.enqueue({attack:roll.attack,source:roll.attack.attacker,target:roll.attack.target,damage:roll.damage,maxHit:roll.maxHit,
    landed:roll.landed,hitsplatType:DeferredHitsplatType.Normal,attackType:AttackType.Melee,revealClock:1,profileId:"maxhit-test"});
assert.equal(queue.processTick(1,{hitsplats:[]} as any)[0].amount,1,"boss reduction/cap survives maxhit");
npc.incomingPlayerDamageCap=undefined;
let parts=0;npc.onPlayerHit=()=>parts++;
for(const [clock,multiplier,expected] of [[2,0.5,10],[3,1,21]]) {
    npc.incomingPlayerDamageMultiplier=multiplier;
    queue.enqueue({attack:roll.attack,source:roll.attack.attacker,target:roll.attack.target,damage:21,maxHit:21,
        landed:true,hitsplatType:DeferredHitsplatType.Normal,attackType:AttackType.Melee,revealClock:clock,profileId:"bloat-window-test"});
    assert.equal(queue.processTick(clock,{hitsplats:[]} as any)[0].amount,expected,"Bloat's active reduction floors odd hits; down window restores full damage");
}
assert.equal(parts,2,"each applied hitsplat reaches Bloat's speed/down-attack hook");
npc.onPlayerHit=undefined;
setDeveloperMaxHitEnabled(player,false);
assert(!isDeveloperMaxHitEnabled(player));
assert.equal(evaluator.evaluate(attack(AttackType.Melee)).landed,false,"normal misses return after disabling");
console.log("Developer maxhit: toggle, instakill exclusion, all three styles and multi-hit capped specials passed");
