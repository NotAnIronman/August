import assert from "node:assert/strict";

import type { CombatEntity } from "@server/game/combat/engine/CombatTargetResolver";
import type { CombatAttack } from "@server/game/combat/model/CombatAttack";
import { WeaponSpecialAttackRegistry } from "@server/game/combat/special-attacks/WeaponSpecialAttackRegistry";
import { VESTAS_SPEAR_BH_PROFILE } from "@server/game/combat/special-attacks/implementations/VestasSpearBhSpec";

const special = VESTAS_SPEAR_BH_PROFILE.handleSpecialAttack?.(
    {} as CombatEntity,
    {} as CombatEntity,
    {} as CombatAttack,
);
assert.ok(special);
assert.equal(special.energyCostPercent, 50);
assert.equal(special.hitCount, 1);
assert.equal(special.accuracyMultiplier, 1);
assert.equal(special.damageMultiplier, 1);
assert.equal(WeaponSpecialAttackRegistry.get(27900)?.energyCost, 50);

console.log("vesta's spear (bh) regression test passed");
