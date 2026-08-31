import assert from "node:assert/strict";

import type { CombatEntity } from "@server/game/combat/engine/CombatTargetResolver";
import type { CombatAttack } from "@server/game/combat/model/CombatAttack";
import { WeaponSpecialAttackRegistry } from "@server/game/combat/special-attacks/WeaponSpecialAttackRegistry";
import {
    SARADOMIN_SWORD_PROFILE,
    rollSaradominSwordLightningDamage,
} from "@server/game/combat/special-attacks/implementations/SaradominSwordSpec";

const special = SARADOMIN_SWORD_PROFILE.handleSpecialAttack?.(
    {} as CombatEntity,
    {} as CombatEntity,
    {} as CombatAttack,
);
assert.ok(special);
assert.equal(special.energyCostPercent, 100);
assert.equal(special.hitCount, 1);
assert.equal(special.damageMultiplier, 1.1);
assert.equal(special.meleeDefenceBonusIndex, 1);
assert.equal(special.attackAnimation, 1132);
assert.equal(special.castGraphic?.id, 1194);
assert.notEqual(typeof SARADOMIN_SWORD_PROFILE.impactGraphic, "function");
assert.equal(
    typeof SARADOMIN_SWORD_PROFILE.impactGraphic === "function"
        ? undefined
        : SARADOMIN_SWORD_PROFILE.impactGraphic?.id,
    1195,
);
assert.equal(rollSaradominSwordLightningDamage(() => 0), 1);
assert.equal(rollSaradominSwordLightningDamage(() => 0.99999), 16);

const script = WeaponSpecialAttackRegistry.get(11838);
assert.ok(script);
assert.equal(script.energyCost, 100);

console.log("saradomin sword regression test passed");
