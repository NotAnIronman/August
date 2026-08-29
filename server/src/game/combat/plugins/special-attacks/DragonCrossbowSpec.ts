import type { CombatAttack } from "../../model/CombatAttack";
import {
    WeaponSpecialAttackTargetPattern,
    type WeaponSpecialAttackScript,
    setWeaponSpecialAttackTraitOverrides,
} from "../WeaponSpecialAttackScript";

const DRAGON_CROSSBOW_ITEM_ID = 21902;
const ANNIHILATE_ENERGY_COST = 60;
const ANNIHILATE_PRIMARY_DAMAGE_MULTIPLIER = 1.2;
const ANNIHILATE_TARGETING = Object.freeze({ pattern: WeaponSpecialAttackTargetPattern.TargetSquare, width: 3, maxTargets: 9, requiresMultiCombat: true, secondaryDamageMultiplier: 0.8 });

/**
 * Annihilate deals 20% additional damage to its primary target. In OSRS, it
 * also rolls the same hit against up to eight surrounding targets in a
 * multi-combat 3x3 area, each at 80% damage, and suppresses enchanted-bolt
 * effects. Those require engagement-level area targeting and projectile-proc
 * hooks, neither of which belongs to the weapon-script contract.
 */
export class DragonCrossbowSpec implements WeaponSpecialAttackScript {
    readonly itemId = DRAGON_CROSSBOW_ITEM_ID;
    readonly energyCost = ANNIHILATE_ENERGY_COST;

    modifyAttackTraits(attack: CombatAttack): void {
        setWeaponSpecialAttackTraitOverrides(attack, {
            hitCount: 1,
            damageMultiplier: ANNIHILATE_PRIMARY_DAMAGE_MULTIPLIER,
            targeting: ANNIHILATE_TARGETING,
        });
    }

    onHitApplied(
        attacker: any,
        target: any,
        damageCalculated: number,
        currentMapClock: number,
    ): void {
        void attacker;
        void target;
        void damageCalculated;
        void currentMapClock;
    }
}

export const DRAGON_CROSSBOW_SPEC = Object.freeze(new DragonCrossbowSpec());
