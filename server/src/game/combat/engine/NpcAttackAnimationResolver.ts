import type { CombatAttackTraits } from "../model/CombatAttack";

export function resolveNpcAttackAnimation(options: {
    traits: CombatAttackTraits;
    specialAttackAnimation?: number;
    defaultAttackAnimation: number;
}): number | undefined {
    const explicit = validAnimation(options.traits.animationId);
    if (explicit !== undefined) return explicit;
    const special = validAnimation(options.specialAttackAnimation);
    if (special !== undefined) return special;
    if (options.traits.suppressDefaultNpcAnimation) return undefined;
    return validAnimation(options.defaultAttackAnimation);
}

function validAnimation(value: number | undefined): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.trunc(value)
        : undefined;
}

