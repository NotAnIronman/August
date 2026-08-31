import type { CombatAttack } from "../../model/CombatAttack";
import {
    SpecialAttackTiming,
    type WeaponCombatProfile,
} from "../WeaponCombatProfile";
import {
    type WeaponSpecialAttackScript,
    type WeaponSpecialAttackTraitOverrides,
    setWeaponSpecialAttackTraitOverrides,
} from "../WeaponSpecialAttackScript";

const DRAGON_CLAWS_ITEM_ID = 13652;
const DRAGON_CLAWS_CR_ITEM_ID = 20784;
const DRAGON_CLAWS_ITEM_IDS = Object.freeze([
    DRAGON_CLAWS_ITEM_ID,
    DRAGON_CLAWS_CR_ITEM_ID,
]);

const SLICE_AND_DICE_ENERGY_COST = 50;
const SLICE_AND_DICE_HIT_COUNT = 4;
const SLICE_AND_DICE_ACCURACY_ROLLS = 4;
const SLASH_DEFENCE_BONUS_INDEX = 1;

const SLICE_AND_DICE_ANIMATION_ID = 7514;
const SLICE_AND_DICE_GRAPHIC_ID = 1171;
const SLICE_AND_DICE_HIT_DELAYS = Object.freeze([0, 0, 1, 1]);
const SLICE_AND_DICE_HIT_SOUNDS = Object.freeze([4138, 4140, 4141, 4141]);

/**
 * Redistributes the successful branch's single integer damage roll into the
 * four Slice and Dice hitsplats. All divisions deliberately floor.
 */
export function calculateDragonClawsHitDistribution(
    firstSuccessfulAccuracyRoll: number,
    rolledDamage: number,
): readonly number[] {
    const branch = Math.max(1, Math.min(4, Math.trunc(firstSuccessfulAccuracyRoll)));
    const damage = Math.max(0, Math.floor(rolledDamage));
    if (branch === 1) {
        return Object.freeze([
            damage,
            Math.floor(damage / 2),
            Math.floor(damage / 4),
            Math.floor(damage / 4) + 1,
        ]);
    }
    if (branch === 2) {
        return Object.freeze([
            0,
            damage,
            Math.floor(damage / 2),
            Math.floor(damage / 2) + 1,
        ]);
    }
    if (branch === 3) {
        return Object.freeze([0, 0, damage, damage + 1]);
    }
    return Object.freeze([0, 0, 0, damage]);
}

const DRAGON_CLAWS_DAMAGE_RANGES = Object.freeze([
    Object.freeze({
        minimumDamageMultiplier: 0.5,
        maximumDamageMultiplier: 1,
        maximumDamageReduction: 1,
        hitDamageMultipliers: Object.freeze([1, 0.5, 0.25, 0.25]),
        distributeDamage: (damage: number) => calculateDragonClawsHitDistribution(1, damage),
    }),
    Object.freeze({
        minimumDamageMultiplier: 3 / 8,
        maximumDamageMultiplier: 7 / 8,
        hitDamageMultipliers: Object.freeze([0, 1, 0.5, 0.5]),
        distributeDamage: (damage: number) => calculateDragonClawsHitDistribution(2, damage),
    }),
    Object.freeze({
        minimumDamageMultiplier: 1 / 4,
        maximumDamageMultiplier: 3 / 4,
        hitDamageMultipliers: Object.freeze([0, 0, 1, 1]),
        distributeDamage: (damage: number) => calculateDragonClawsHitDistribution(3, damage),
    }),
    Object.freeze({
        minimumDamageMultiplier: 1 / 4,
        maximumDamageMultiplier: 5 / 4,
        hitDamageMultipliers: Object.freeze([0, 0, 0, 1]),
        distributeDamage: (damage: number) => calculateDragonClawsHitDistribution(4, damage),
    }),
]);

// Uniform selection gives 1/3 all-zero and 2/3 two-damage outcomes.
export const DRAGON_CLAWS_ALL_MISS_PATTERNS = Object.freeze([
    Object.freeze([0, 0, 0, 0]),
    Object.freeze([0, 0, 0, 0]),
    Object.freeze([1, 1, 0, 0]),
    Object.freeze([0, 0, 1, 1]),
    Object.freeze([1, 0, 1, 0]),
    Object.freeze([0, 1, 0, 1]),
]);

const DRAGON_CLAWS_TRAITS: WeaponSpecialAttackTraitOverrides = Object.freeze({
    hitCount: SLICE_AND_DICE_HIT_COUNT,
    accuracyMultiplier: 1,
    damageMultiplier: 1,
    meleeDefenceBonusIndex: SLASH_DEFENCE_BONUS_INDEX,
    accuracyRollCount: SLICE_AND_DICE_ACCURACY_ROLLS,
    firstSuccessfulAccuracyDamageRanges: DRAGON_CLAWS_DAMAGE_RANGES,
    allMissDamagePatterns: DRAGON_CLAWS_ALL_MISS_PATTERNS,
    hitDelayTicks: SLICE_AND_DICE_HIT_DELAYS,
});

export const DRAGON_CLAWS_PROFILE: WeaponCombatProfile = Object.freeze({
    id: "core:dragon_claws",
    itemIds: DRAGON_CLAWS_ITEM_IDS,
    specialAttackEnergyCost: SLICE_AND_DICE_ENERGY_COST,
    specialAttackTiming: SpecialAttackTiming.Standard,
    handleSpecialAttack: () =>
        Object.freeze({
            energyCostPercent: SLICE_AND_DICE_ENERGY_COST,
            ...DRAGON_CLAWS_TRAITS,
            hitCount: SLICE_AND_DICE_HIT_COUNT,
            accuracyMultiplier: 1,
            damageMultiplier: 1,
            attackAnimation: SLICE_AND_DICE_ANIMATION_ID,
            castGraphic: Object.freeze({ id: SLICE_AND_DICE_GRAPHIC_ID }),
            impactSoundIds: SLICE_AND_DICE_HIT_SOUNDS,
        }),
});

/** Shared Slice and Dice implementation for Dragon claws and Dragon claws (cr). */
export class DragonClawsSpec implements WeaponSpecialAttackScript {
    constructor(readonly itemId: number) {}

    readonly energyCost = SLICE_AND_DICE_ENERGY_COST;

    modifyAttackTraits(attack: CombatAttack): void {
        setWeaponSpecialAttackTraitOverrides(attack, DRAGON_CLAWS_TRAITS);
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

export const DRAGON_CLAWS_SPECS = Object.freeze(
    DRAGON_CLAWS_ITEM_IDS.map((itemId) => Object.freeze(new DragonClawsSpec(itemId))),
);

export const DRAGON_CLAWS_SPEC = DRAGON_CLAWS_SPECS[0];
