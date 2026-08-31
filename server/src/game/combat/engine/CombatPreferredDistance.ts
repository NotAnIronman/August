import type { CombatAttackTraits } from "../model/CombatAttack";

export function resolvePreferredDistanceTiles(
    traits: CombatAttackTraits,
): number | undefined {
    const preferred = traits.preferredDistanceTiles;
    if (preferred === undefined || !Number.isFinite(preferred)) return undefined;
    return Math.min(
        Math.max(1, Math.trunc(preferred)),
        Math.max(1, Math.trunc(traits.rangeTiles)),
    );
}

export function shouldApproachPreferredDistance(
    distanceTiles: number,
    traits: CombatAttackTraits,
): boolean {
    const preferred = resolvePreferredDistanceTiles(traits);
    return preferred !== undefined && distanceTiles > preferred;
}

