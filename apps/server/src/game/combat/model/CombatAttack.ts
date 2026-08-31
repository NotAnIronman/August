import type { AttackType } from "@server/game/combat/AttackType";
import type { CombatEntityRef } from "@server/game/combat/model/CombatEntityRef";

export const CombatAttackStyle = Object.freeze({
    Accurate: "accurate",
    Aggressive: "aggressive",
    Controlled: "controlled",
    Defensive: "defensive",
    Rapid: "rapid",
    Longrange: "longrange",
} as const);

export type CombatAttackStyle = (typeof CombatAttackStyle)[keyof typeof CombatAttackStyle];

/** Effects authored by encounters and applied to a successful NPC hit. */
export interface CombatAttackEffects {
    readonly ignoreProtectionPrayer?: boolean;
    readonly guaranteedHit?: boolean;
    /** Absolute minimum damage for a landed hit; unlike a bonus it does not raise its maximum. */
    readonly minimumHit?: number;
    readonly poisonDamage?: number;
    /** Fraction of the target's current Prayer points removed after a hit. */
    readonly prayerDrainFraction?: number;
    /** Use this combat type for the target's defence roll while retaining the attack's hit type. */
    readonly defenceRollAttackType?: AttackType;
}

/** Immutable traits selected for one attack cycle. */
export interface CombatAttackTraits {
    readonly type: AttackType;
    readonly style: CombatAttackStyle | null;
    readonly rangeTiles: number;
    /** Optional distance the attacker keeps approaching toward, independent of attack reach. */
    readonly preferredDistanceTiles?: number;
    readonly speedTicks: number;
    /** Per-attack NPC maximum hit, used by multi-style encounter definitions. */
    readonly maxHitOverride?: number;
    /** Server-resolved NPC attack sequence override for this exact attack cycle. */
    readonly animationId?: number;
    /** Prevent unsafe generic animation fallback when an explicit named role is unresolved. */
    readonly suppressDefaultNpcAnimation?: boolean;
    readonly weaponId?: number;
    readonly spellId?: number;
    readonly specialAttack?: boolean;
    readonly effects?: Readonly<CombatAttackEffects>;
    readonly autocast?: boolean;
}

/**
 * Engine-neutral description of an attack after its target and traits have
 * been resolved, but before weapon plugins and hit processing run.
 */
export interface CombatAttack {
    readonly attacker: CombatEntityRef;
    readonly target: CombatEntityRef;
    readonly attackClock: number;
    readonly traits: Readonly<CombatAttackTraits>;
}
