import { getProviderRegistry } from "@server/game/providers/ProviderRegistry";
import type { AttackType } from "@server/game/combat/AttackType";

// Types

export interface FallbackSpecialAttackEffect {
    freezeTicks?: number;
    stunTicks?: number;
    healFraction?: number;
    prayerFraction?: number;
    drainDefence?: number;
    drainDefenceByDamage?: number;
    drainDefenceOnlyByDamage?: number;
    drainMagicByDamage?: boolean;
    drainCombatStatByDamage?: boolean;
    drainAttack?: number;
    drainStrength?: number;
    drainRanged?: number;
    drainAllCombatByDamage?: boolean;
    drainRunEnergy?: number;
    applyPoison?: number;
    applyVenom?: boolean;
    guaranteedFirstHit?: boolean;
    doubleHit?: boolean;
    quadHit?: boolean;
    rangeBoost?: number;
    drainPrayerByDamage?: boolean;
    teleportBehind?: boolean;
    ignoreProtectionPrayer?: boolean;
}

export interface FallbackSpecialAttackDefinition {
    weaponIds: number[];
    energyCost: number;
    accuracyMultiplier: number;
    damageMultiplier: number;
    hitCount: number;
    attackType?: AttackType;
    effects?: FallbackSpecialAttackEffect;
    animationId?: number;
    graphicId?: number;
    targetGraphicId?: number;
    projectileId?: number;
    soundId?: number;
    hitSounds?: number[];
    name: string;
    minDamagePerHit?: number;
    maxDamagePerHit?: number;
    ammoModifiers?: {
        [ammoId: number]: {
            damageMultiplier: number;
            minDamagePerHit: number;
            maxDamagePerHit?: number;
            graphicId?: number;
            projectileId?: number;
            soundId?: number;
            name?: string;
        };
        default?: {
            damageMultiplier: number;
            minDamagePerHit: number;
            maxDamagePerHit?: number;
            graphicId?: number;
            projectileId?: number;
            soundId?: number;
            name?: string;
        };
    };
}

/**
 * Compatibility catalog used only when no detailed weapon script or combat
 * profile handles a special attack. New specials belong in implementations/.
 */
export interface FallbackSpecialAttackProvider {
    get(weaponId: number): FallbackSpecialAttackDefinition | undefined;
    has(weaponId: number): boolean;
    getEnergyCost(weaponId: number): number;
    resolveAmmoModifiers(
        specialDef: FallbackSpecialAttackDefinition,
        ammoId: number,
    ): {
        damageMultiplier: number;
        minDamagePerHit: number;
        maxDamagePerHit?: number;
        graphicId?: number;
        projectileId?: number;
        soundId?: number;
        name: string;
    };
    applyDarkBowDamageModifiers(
        damage: number,
        minDamage: number,
        maxDamage: number | undefined,
        hitLanded: boolean,
    ): number;
    isDarkBow(weaponId: number): boolean;
    calculateDragonClawsHits(maxHit: number, hitRolls: number[]): number[];
    canGraniteMaulCombo(weaponId: number, lastAttackTick: number, currentTick: number): boolean;
}

function ensureProvider(): FallbackSpecialAttackProvider {
    const p = getProviderRegistry().fallbackSpecialAttack;
    if (!p) {
        throw new Error(
            "[FallbackSpecialAttackProvider] catalog not registered; initialize the gamemode first.",
        );
    }
    return p;
}

export function getFallbackSpecialAttack(weaponId: number): FallbackSpecialAttackDefinition | undefined {
    return ensureProvider().get(weaponId);
}
