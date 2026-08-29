import { SpellCaster } from "@server/game/spells/SpellCaster";
import { getSpellData } from "@server/game/spells/SpellDataProvider";
import { AttackType } from "@server/game/combat/AttackType";

export const RANGED_WEAPON_CATEGORIES = new Set<number>([3, 5, 6, 7, 8, 19]);
export const MAGIC_WEAPON_CATEGORIES = new Set<number>([18, 24, 29]);
export const POWERED_STAFF_CATEGORIES = new Set<number>([24]);
export const SALAMANDER_WEAPON_CATEGORY = 31;
/** Category 12: Jab/Swipe/Fend (Halberds) — see WeaponInterfaces.ts. */
export const HALBERD_WEAPON_CATEGORY = 12;
/** Aviansies and the Armadyl generals are airborne beyond ordinary melee reach. */
const AIRBORNE_AVIANSIE_NPC_TYPE_IDS = new Set<number>([
    3162, 3163, 3164, 3165,
    3170, 3171, 3172, 3173, 3174, 3175, 3176, 3177, 3178, 3179, 3180, 3181,
]);

export function isAirborneAviansie(npcTypeId: number): boolean {
    return AIRBORNE_AVIANSIE_NPC_TYPE_IDS.has(Math.trunc(npcTypeId));
}

export function canMeleeHitAirborneAviansie(weaponCategory: number | undefined): boolean {
    return weaponCategory === HALBERD_WEAPON_CATEGORY || weaponCategory === SALAMANDER_WEAPON_CATEGORY;
}
/** OSRS reach for halberd-class weapons when no cache-supplied range overrides it. */
export const DEFAULT_HALBERD_MELEE_RANGE = 2;
export const DEFAULT_NPC_MELEE_RANGE = 1;
export const DEFAULT_NPC_RANGED_RANGE = 7;
export const DEFAULT_NPC_MAGIC_RANGE = 10;

export interface PlayerCombatRuleState {
    weaponCategory?: number;
    styleSlot?: number;
    weaponRange?: number;
    spellId?: number;
    autocastEnabled?: boolean;
}

export interface PlayerAttackReachOptions {
    /**
     * Explicit weapon range (typically ObjType param 13). If absent, uses combatWeaponRange.
     */
    baseRange?: number;
    /**
     * Optional spell range resolver override for tests/callers.
     */
    resolveSpellRange?: (spellId: number) => number | undefined;
}

export interface NpcCombatRuleState {
    getAttackType?: () => AttackType | undefined;
    attackRange?: number;
    combat?: {
        attackType?: AttackType;
        attackRange?: number;
    };
}

function resolveSpellRangeFromData(spellId: number): number | undefined {
    if (!(spellId > 0)) return undefined;
    const spellData = getSpellData(spellId);
    if (!spellData) return undefined;
    return Math.max(1, SpellCaster.getSpellRange(spellData));
}

function normalizeBaseRange(
    state: PlayerCombatRuleState,
    explicitBaseRange: number | undefined,
): number | undefined {
    if (explicitBaseRange !== undefined && Number.isFinite(explicitBaseRange)) {
        const range = explicitBaseRange;
        if (range > 0) return Math.max(1, range);
    }
    const storedRange = state.weaponRange ?? 0;
    if (storedRange > 0) return Math.max(1, storedRange);
    return undefined;
}

/**
 * Resolve the player's current attack type for range/LoS checks.
 * This follows OSRS hybrid-weapon behavior (staves/salamanders/powered staves).
 */
export function resolvePlayerAttackType(state: PlayerCombatRuleState): AttackType {
    const category = state.weaponCategory ?? 0;
    const styleSlot = state.styleSlot ?? 0;
    const spellId = state.spellId ?? -1;
    const autocastEnabled = !!state.autocastEnabled;

    if (category === SALAMANDER_WEAPON_CATEGORY) {
        if (styleSlot === 0) return AttackType.Melee;
        if (styleSlot === 1) return AttackType.Ranged;
        return AttackType.Magic;
    }

    if (POWERED_STAFF_CATEGORIES.has(category)) {
        return AttackType.Magic;
    }

    if (RANGED_WEAPON_CATEGORIES.has(category)) {
        return AttackType.Ranged;
    }

    if (MAGIC_WEAPON_CATEGORIES.has(category)) {
        return spellId > 0 && autocastEnabled ? AttackType.Magic : AttackType.Melee;
    }

    return AttackType.Melee;
}

/**
 * Resolve player attack reach for combat range checks.
 */
export function resolvePlayerAttackReach(
    state: PlayerCombatRuleState,
    options: PlayerAttackReachOptions = {},
): number {
    const category = state.weaponCategory ?? 0;
    const styleSlot = state.styleSlot ?? 0;
    const spellId = state.spellId ?? -1;
    const autocastEnabled = !!state.autocastEnabled;
    const baseRange = normalizeBaseRange(state, options.baseRange);
    const attackType = resolvePlayerAttackType(state);

    if (category === SALAMANDER_WEAPON_CATEGORY) {
        if (styleSlot === 0) return 1;
        if (styleSlot === 1) return baseRange ?? 7;
        return 10;
    }

    if (attackType === AttackType.Magic) {
        if (POWERED_STAFF_CATEGORIES.has(category)) return 10;
        if (spellId > 0 && autocastEnabled && MAGIC_WEAPON_CATEGORIES.has(category)) {
            const spellRange =
                options.resolveSpellRange?.(spellId) ?? resolveSpellRangeFromData(spellId);
            return Math.max(1, spellRange ?? 10);
        }
        return 1;
    }

    if (attackType === AttackType.Ranged) {
        const isLongrange = styleSlot === 3;
        const range = baseRange ?? 7;
        return Math.max(1, range + (isLongrange ? 2 : 0));
    }

    // Melee
    if (MAGIC_WEAPON_CATEGORIES.has(category)) return 1;
    if (category === HALBERD_WEAPON_CATEGORY) {
        // Halberds reach 2 tiles even when the equipped item's cache
        // definition doesn't carry an explicit param 13 weapon range.
        return Math.max(DEFAULT_HALBERD_MELEE_RANGE, baseRange ?? DEFAULT_HALBERD_MELEE_RANGE);
    }
    return Math.max(1, baseRange ?? 1);
}

export function resolveNpcAttackType(state: NpcCombatRuleState, explicit?: AttackType): AttackType {
    if (
        explicit === AttackType.Melee ||
        explicit === AttackType.Ranged ||
        explicit === AttackType.Magic
    ) {
        return explicit;
    }
    const direct = state.getAttackType?.();
    if (
        direct === AttackType.Melee ||
        direct === AttackType.Ranged ||
        direct === AttackType.Magic
    ) {
        return direct;
    }
    const rootAttackType = (state as { attackType?: AttackType }).attackType;
    if (
        rootAttackType === AttackType.Melee ||
        rootAttackType === AttackType.Ranged ||
        rootAttackType === AttackType.Magic
    ) {
        return rootAttackType;
    }
    const profile = state.combat?.attackType;
    if (
        profile === AttackType.Melee ||
        profile === AttackType.Ranged ||
        profile === AttackType.Magic
    ) {
        return profile;
    }
    return AttackType.Melee;
}

export function resolveNpcAttackRange(state: NpcCombatRuleState, attackType?: AttackType): number {
    const rootConfiguredRange = state.attackRange;
    if (typeof rootConfiguredRange === "number" && rootConfiguredRange > 0) {
        return Math.max(1, rootConfiguredRange);
    }

    const configuredRange = state.combat?.attackRange;
    if (typeof configuredRange === "number" && configuredRange > 0) {
        return Math.max(1, configuredRange);
    }

    const resolvedType = resolveNpcAttackType(state, attackType);
    switch (resolvedType) {
        case AttackType.Magic:
            return DEFAULT_NPC_MAGIC_RANGE;
        case AttackType.Ranged:
            return DEFAULT_NPC_RANGED_RANGE;
        case AttackType.Melee:
        default:
            return DEFAULT_NPC_MELEE_RANGE;
    }
}
