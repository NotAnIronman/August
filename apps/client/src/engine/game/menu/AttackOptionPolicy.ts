/** Values used by the cache-backed player/NPC attack-option dropdowns. */
export const ATTACK_OPTION_DEPENDS_ON_COMBAT_LEVELS = 0;
export const ATTACK_OPTION_ALWAYS_RIGHT_CLICK = 1;
export const ATTACK_OPTION_LEFT_CLICK_WHERE_AVAILABLE = 2;
export const ATTACK_OPTION_HIDDEN = 3;

export type AttackOptionMode = 0 | 1 | 2 | 3;

export function normalizeAttackOptionMode(value: unknown): AttackOptionMode {
    const numeric = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
    return Math.max(ATTACK_OPTION_DEPENDS_ON_COMBAT_LEVELS, Math.min(ATTACK_OPTION_HIDDEN, numeric)) as AttackOptionMode;
}

export function shouldDeprioritizeAttack(
    mode: AttackOptionMode,
    localCombatLevel: number,
    targetCombatLevel: number,
): boolean {
    if (mode === ATTACK_OPTION_ALWAYS_RIGHT_CLICK) return true;
    if (mode === ATTACK_OPTION_LEFT_CLICK_WHERE_AVAILABLE) return false;
    if (mode === ATTACK_OPTION_HIDDEN) return true;
    return Math.max(0, Math.trunc(targetCombatLevel)) > Math.max(0, Math.trunc(localCombatLevel));
}
