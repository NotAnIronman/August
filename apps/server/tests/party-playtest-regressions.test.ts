import assert from "node:assert/strict";
import { MultiCombatSystem } from "@server/game/combat/MultiCombatZones";
import { DamageType, type DropEligibility } from "@server/game/combat/DamageTracker";
import { includeLethalContribution, partyDamageThreshold, partyLootEligibility } from "@server/game/combat/PartyLootEligibility";
import { PlayerMoonState, sanitizeMoonProgress } from "@server/game/state/PlayerMoonState";
import type { PlayerState } from "@server/game/player";
import type { NpcState } from "@server/game/npc";
import { LUNAR_COMMON_REWARDS, lunarChestRollCount, rollLunarCommonReward } from "@server/content/modules/moons-of-peril/LunarChestRewards";
import { LEATHER_RECIPES } from "@server/content/gamemodes/vanilla/skills/crafting/productionData";

const multi = new MultiCombatSystem();
assert.equal(multi.isMultiCombat(3200, 3200, 0, 99), false);
multi.setPartyWorldView(99, true);
assert.equal(multi.isMultiCombat(3200, 3200, 0, 99), true);
assert.equal(multi.isMultiCombat(3200, 3200, 0, 100), false);
multi.setPartyWorldView(99, false);
assert.equal(multi.isMultiCombat(3200, 3200, 0, 99), false, "recycled views must not inherit multi");

const players = Array.from({length: 5}, (_, id) => ({id, worldViewId: 99, level: 0} as PlayerState));
const boss = {worldViewId: 99, level: 0, getMaxHitpoints: () => 1000} as NpcState;
function eligibility(damages: number[]): DropEligibility {
    return {primaryLooter: players[0], eligibleLooters: [players[0]], totalDamage: damages.reduce((a,b)=>a+b,0),
        damageSummaries: damages.map((totalDamage,i)=>({player:players[i],playerId:i,totalDamage,
            damageByType:new Map([[DamageType.Melee,totalDamage]]),firstHitTick:0,lastHitTick:1,hitCount:1}))};
}
for (const [size, threshold] of [[2,300],[3,250],[4,200],[5,150]]) {
    assert.equal(partyDamageThreshold(size), threshold / 1000);
    const original = eligibility([threshold, threshold-1]);
    assert.deepEqual(partyLootEligibility(boss, original, players, size).eligibleLooters, [players[0]]);
    const final = includeLethalContribution(original, players[1], 1, 2);
    assert.equal(original.damageSummaries[1].totalDamage, threshold-1, "do not mutate damage tracker snapshot");
    assert.equal(partyLootEligibility(boss, final, players, size).eligibleLooters.length, 2, "lethal contribution counts");
}
players[1].worldViewId = 100;
assert.deepEqual(partyLootEligibility(boss, eligibility([500,500]), players, 2).eligibleLooters, [players[0]]);

for (let mask=0; mask<8; mask++) {
    const moons = new PlayerMoonState(); moons.deserialize(mask);
    assert.equal(moons.serialize(),mask);
    moons.deserialize(0); assert.equal(moons.defeated.size,0);
}
for (const invalid of [undefined,null,"7",-1,8,1.5,NaN]) assert.equal(sanitizeMoonProgress(invalid),0);
console.log("Party multi isolation, Araxxor thresholds/lethal damage and Moons progress round trips passed");
assert.deepEqual([0,1,2,3].map(lunarChestRollCount),[0,1,3,6]);
let weight=0;
for(const item of LUNAR_COMMON_REWARDS) {
    const pick=(weight+0.5)/30;
    for(const [quantityRoll,expected] of [[0,item.min],[0.99999,item.max]]) {
        const values=[pick,quantityRoll];
        assert.deepEqual(rollLunarCommonReward(()=>values.shift()!),{itemId:item.itemId,quantity:expected});
    }
    weight+=item.weight;
}
assert.equal(weight,30);
for(const color of ["green","blue","red","black","hueycoatl"]) {
    for(const [part,quantity] of [["vamb",1],["chaps",2],["body",3]] as const)
        assert.equal(LEATHER_RECIPES.find(r=>r.id===`${color}_${part}`)?.inputs[0].quantity,quantity);
}
assert.equal(LEATHER_RECIPES.find(r=>r.id==="hueycoatl_coif")?.inputs[0].quantity,2);
