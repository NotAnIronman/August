import assert from "node:assert/strict";

import type { CombatEntity } from "@server/game/combat/engine/CombatTargetResolver";
import type { CombatAttack } from "@server/game/combat/model/CombatAttack";
import { WeaponSpecialAttackRegistry } from "@server/game/combat/special-attacks/WeaponSpecialAttackRegistry";
import { ROSEWOOD_BLOWPIPE_PROFILE } from "@server/game/combat/special-attacks/implementations/RosewoodBlowpipeSpec";

assert.deepEqual(ROSEWOOD_BLOWPIPE_PROFILE.itemIds, [31586]);
const special = ROSEWOOD_BLOWPIPE_PROFILE.handleSpecialAttack?.(
    {} as CombatEntity,
    {} as CombatEntity,
    {} as CombatAttack,
);
assert.ok(special);
assert.equal(special.energyCostPercent, 25);
assert.equal(special.hitCount, 2);
assert.equal(special.accuracyMultiplier, 0.8);
assert.equal(special.damageMultiplier, 1.1);
assert.deepEqual(special.hitDelayTicks, [0, 1]);
assert.equal(special.attackAnimation, 5061);

const script = WeaponSpecialAttackRegistry.get(31586);
assert.ok(script);
assert.equal(script.energyCost, 25);

console.log("rosewood blowpipe regression test passed");
