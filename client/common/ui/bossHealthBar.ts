/** Cache-native `hpbar_hud` interface. */
export const BOSS_HEALTH_BAR_GROUP_ID = 303;

export const BossHealthBarComponent = Object.freeze({
    Root: 0,
    /** Native boss-health container toggled by cache script 2103. */
    Health: 5,
    Name: 9,
    Empty: 13,
    FillDark: 14,
    FillLight: 15,
    Value: 20,
});

/** Variables consumed by the cache's hpbar_hud scripts (2099-2103). */
export const BossHealthBarVar = Object.freeze({
    NpcType: 1683,
});

export const BossHealthBarVarbit = Object.freeze({
    Current: 6099,
    Maximum: 6100,
    /** Selects the cache's boss HUD path instead of its standard target bar. */
    Boss: 12401,
    Disabled: 12389,
});

export function bossHealthBarUid(componentId: number): number {
    return (BOSS_HEALTH_BAR_GROUP_ID << 16) | (componentId & 0xffff);
}

export function normalizeBossHealth(current: number, maximum: number): {
    current: number;
    maximum: number;
    percent: number;
} {
    const normalizedMaximum = Math.max(1, Math.trunc(maximum));
    const normalizedCurrent = Math.max(
        0,
        Math.min(normalizedMaximum, Math.trunc(current)),
    );
    return {
        current: normalizedCurrent,
        maximum: normalizedMaximum,
        percent: Math.round((normalizedCurrent * 100) / normalizedMaximum),
    };
}

/** Text shown inside the native cache bar; the NPC name is its adjacent native label. */
export function formatBossHealthValue(current: number, maximum: number): string {
    const health = normalizeBossHealth(current, maximum);
    return `${health.current}/${health.maximum} | ${health.percent}%`;
}
