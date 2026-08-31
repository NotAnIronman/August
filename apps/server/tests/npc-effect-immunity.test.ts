import assert from "node:assert/strict";

import { getBaseNpcEffectImmunities, mergeNpcEffectImmunities } from "@server/game/combat/NpcEffectImmunity";
import { NpcState } from "@server/game/npc";

function npc(immunities = {}) {
    return new NpcState(1, 1, 1, -1, -1, 32, { x: 3200, y: 3200, level: 0 }, {
        maxHitpoints: 100,
        effectImmunities: immunities,
    });
}

const immune = npc({
    poison: true,
    venom: true,
    disease: true,
    freeze: true,
    bind: true,
    burn: true,
    stun: true,
    knockback: true,
    "stat-drain": true,
});
assert.equal(immune.inflictPoison(6, 0), false);
assert.equal(immune.inflictVenom(6, 0), false);
assert.equal(immune.inflictDisease(6, 0), false);
assert.equal(immune.applyFreeze(10, 0), false);
assert.equal(immune.applyFreeze(10, 0, "bind"), false);
assert.equal(immune.drainCombatStat("defence", 10), 0);
assert.equal(immune.isImmuneToEffect("burn"), true);
assert.equal(immune.isImmuneToEffect("stun"), true);
assert.equal(immune.isImmuneToEffect("knockback"), true);

const susceptible = npc();
assert.equal(susceptible.inflictPoison(6, 0), true);
assert.equal(susceptible.inflictVenom(6, 0), true);
assert.equal(susceptible.inflictDisease(6, 0), true);
assert.equal(susceptible.applyFreeze(10, 0), true);
assert.equal(susceptible.drainCombatStat("defence", 1), 1);

assert.deepEqual(getBaseNpcEffectImmunities(2042), { poison: true, venom: true });
assert.deepEqual(
    mergeNpcEffectImmunities({ poison: true, burn: true }, { poison: false }),
    { poison: false, burn: true },
);

console.log("npc effect immunity tests passed");
