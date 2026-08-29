import type { WeaponCombatProfile } from "../WeaponCombatProfile";
import { WeaponSpecialAttackTargetPattern } from "../WeaponSpecialAttackScript";

/**
 * Category 14: Reap/Chop/Jab/Block (Scythes) — see WeaponInterfaces.ts.
 * Matches every scythe of vitur variant (regular, holy, sanguine, corrupted,
 * charged/uncharged) without needing to hardcode each item id.
 */
const SCYTHE_WEAPON_CATEGORY = 14;

/**
 * Wiki-verified stage multipliers: the 2nd hit rolls at 50% of the base max
 * hit and the 3rd hit rolls at 25%, each floored and rolled independently.
 * Example: base max hit 47 on a 3x3 target -> hits of 47, 23 (floor(47*0.5)),
 * 11 (floor(47*0.25)) -> true max hit 81.
 */
const SCYTHE_SECOND_HIT_DAMAGE_MULTIPLIER = 0.5;
const SCYTHE_THIRD_HIT_DAMAGE_MULTIPLIER = 0.25;

export const SCYTHE_OF_VITUR_TARGETING = Object.freeze({
    pattern: WeaponSpecialAttackTargetPattern.ForwardLine,
    // 1x3 arc: the primary target plus up to two other 1x1 targets in front
    // of the player when not fighting a single large monster.
    width: 3,
    maxTargets: 3,
    // The arc cleave is not restricted to multi-combat areas in OSRS.
    requiresMultiCombat: false,
    largeTargetExtraHits: Object.freeze([
        // 2x2 targets (e.g. Vardorvis) take a second hit at 50% max hit.
        Object.freeze({
            minimumSize: 2,
            accuracyMultiplier: 1,
            damageMultiplier: SCYTHE_SECOND_HIT_DAMAGE_MULTIPLIER,
        }),
        // 3x3+ targets (e.g. dragons, Duke Sucellus) also take a third hit
        // at 25% max hit, in addition to the 50% second hit above.
        Object.freeze({
            minimumSize: 3,
            accuracyMultiplier: 1,
            damageMultiplier: SCYTHE_THIRD_HIT_DAMAGE_MULTIPLIER,
        }),
    ]),
});

const SCYTHE_OF_VITUR_NORMAL_ATTACK = Object.freeze({
    energyCostPercent: 0,
    hitCount: 1,
    accuracyMultiplier: 1,
    damageMultiplier: 1,
    targeting: SCYTHE_OF_VITUR_TARGETING,
});

/**
 * Every scythe swing (not just its special attack) reaches a 1x3 arc in
 * front of the player. Against a single large monster this instead chains
 * extra hits onto the same target (see SCYTHE_OF_VITUR_TARGETING); against
 * ordinary 1x1s it can strike up to two additional targets in the arc, each
 * rolled at full accuracy and damage independently.
 */
export const SCYTHE_OF_VITUR_PROFILE: WeaponCombatProfile = Object.freeze({
    id: "core:scythe_of_vitur",
    categoryIds: Object.freeze([SCYTHE_WEAPON_CATEGORY]),
    handleNormalAttack: () => SCYTHE_OF_VITUR_NORMAL_ATTACK,
});
