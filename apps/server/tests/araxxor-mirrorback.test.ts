import assert from "node:assert/strict";
import { configureMirrorback, configureMirrorbackRedirection, mirrorbackMaxHit } from "@server/content/modules/araxxor-instance/mirrorback";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import { AttackType } from "@server/game/combat/AttackType";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { DeferredHitQueue, DeferredHitsplatType } from "@server/game/combat/engine/DeferredHitQueue";
import { CombatHitEvaluator } from "@server/game/combat/engine/CombatHitEvaluator";
import { npcCombatEntityRef, playerCombatEntityRef } from "@server/game/combat/model/CombatEntityRef";
import { createTestGamemode } from "./fixtures/createTestGamemode";

registerSkillConfiguration({ computeCombatLevel: () => 3, skillRestoreIntervalTicks: 100,
    skillBoostDecayIntervalTicks: 100, hitpointRegenIntervalTicks: 100,
    hitpointOverhealDecayIntervalTicks: 100, preserveDecayMultiplier: 1.5 });
const player = new PlayerState(10, 3200, 3200, 0, createTestGamemode("mirrorback", "Mirrorback"));
const npc = (id: number, type: number, hp: number) => new NpcState(id, type, 1, -1, -1, 32, { x: 3201, y: 3200, level: 0 }, { maxHitpoints: hp });
const boss = npc(20, 13668, 1020), mirror = npc(21, 13671, 58), foreign = npc(22, 13671, 58);
foreign.worldViewId = 77;
const live = new Map([[boss.id, boss], [foreign.id, foreign], [mirror.id, mirror]]);
const recoils: number[] = [];
const redirects: number[] = [];
const services: any = {
    encounters: { ensure: () => ({ snapshotOwnedResources: () => ({ npcRuntimeIds: new Set(live.keys()) }) }) },
    combat: { getNpc: (id: number) => live.get(id),
        applyPlayerDamageToNpc: (_p: PlayerState, target: NpcState, _style: number, damage: number) => { redirects.push(damage); target.applyDamage(damage); },
        applyNpcDamageToPlayer: (_n: NpcState, _p: PlayerState, _s: number, damage: number) => recoils.push(damage) },
};
configureMirrorback(mirror, services);
configureMirrorbackRedirection(boss, services);
const attack = { attacker: playerCombatEntityRef(player.id), target: npcCombatEntityRef(boss.id), attackClock: 1,
    traits: { type: AttackType.Melee, style: null, speedTicks: 4, rangeTiles: 1 } };
const queue = new DeferredHitQueue({ resolveEntity: ref => ref.id === player.id ? player : live.get(ref.id) });
function hit(target: NpcState, damage: number, type: AttackType = AttackType.Melee) {
    queue.enqueue({ attack: { ...attack, target: npcCombatEntityRef(target.id) }, source: attack.attacker,
        target: npcCombatEntityRef(target.id), damage, maxHit: damage, landed: true,
        hitsplatType: DeferredHitsplatType.Normal, attackType: type, revealClock: 1, profileId: "test" });
    return queue.processTick(1, { hitsplats: [] } as any)[0];
}
assert.equal(hit(boss, 100).amount, 80);
assert.equal(mirror.getHitpoints(), 38);
assert.equal(foreign.getHitpoints(), 58, "do not redirect to another instance");
assert.deepEqual(redirects, [20]);
assert.deepEqual(recoils, [10], "half of 20%; redirected damage is not recoiled twice");
mirror.applyDamage(35);
assert.equal(hit(boss, 21).amount, 17);
assert.equal(mirror.getHitpoints(), 0);
assert.deepEqual(recoils, [10, 1], "fatal redirect recoils actual damage, rounded down");
assert.equal(hit(boss, 20).amount, 20, "dead mirrors stop redirecting immediately");
const direct = npc(23, 13671, 58);
live.set(direct.id, direct);
configureMirrorback(direct, services);
assert.equal(direct.forceMaxHitForAttack!(player, { ...attack, traits: { ...attack.traits, type: AttackType.Magic, weaponId: 29796 } }), false,
    "casting while holding a qualifying weapon does not get its melee bonus");
hit(direct, 9);
assert.equal(recoils.at(-1), 4);
const count = recoils.length;
hit(direct, 4, AttackType.Ranged);
hit(direct, 4, AttackType.Magic);
player.teleport(3199, 3200, 0);
hit(direct, 9);
assert.equal(recoils.length, count, "ranged/magic and two-tile melee avoid recoil");
for (const [weapon, style, category] of [[29796,"slash",12], [1,"crush",0], [9185,"ranged",5], [19478,"ranged",19], [19481,"ranged",19]] as const) {
    assert(mirrorbackMaxHit(weapon, style, category));
}
assert.equal(mirrorbackMaxHit(4151, "slash", 20), false);
direct.forceMaxHitForAttack = () => true;
const evaluator = new CombatHitEvaluator({ resolveEntity: ref => ref.id === player.id ? player : direct,
    getEquipmentBonuses: () => Array(14).fill(0), random: () => 0.999999 });
const roll = evaluator.evaluate({ ...attack, target: npcCombatEntityRef(direct.id) });
assert.equal(roll.landed, true);
assert.equal(roll.damage, roll.maxHit, "force max occurs in the actual roll, not merely its hitsplat");
console.log("Mirrorback redirection, recoil, death, instance isolation and max-hit roll passed");
