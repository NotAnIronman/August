/** Legacy cache-native `hpbar_hud` identifiers retained for stale-state cleanup. */
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

/** Legacy variables consumed by the cache's hpbar_hud scripts (2099-2103). */
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

/** Wire and layout limits shared by encounter definitions and the client HUD. */
export const BOSS_HEALTH_BAR_MAX_MARKERS = 32;
export const BOSS_HEALTH_BAR_MAX_MARKER_LABEL_LENGTH = 64;

export const BOSS_HEALTH_BAR_MARKER_STYLES = Object.freeze([
    "phase",
    "mechanic",
    "danger",
] as const);

export type BossHealthBarMarkerStyle =
    (typeof BOSS_HEALTH_BAR_MARKER_STYLES)[number];

/** A health gate rendered as a notch at `percent` of maximum health. */
export interface BossHealthBarMarker {
    readonly percent: number;
    readonly label?: string;
    readonly style?: BossHealthBarMarkerStyle;
}

export type BossHealthBarState =
    | { readonly active: false }
    | {
          readonly active: true;
          readonly npcTypeId: number;
          readonly name: string;
          readonly current: number;
          readonly maximum: number;
          readonly markers: readonly BossHealthBarMarker[];
      };

/**
 * Canonicalizes marker data before it is used in a lifecycle key or packet.
 * Percentages are represented to two decimal places on the wire, so dedupe at
 * that precision too. The first marker at a duplicate percentage wins.
 */
export function normalizeBossHealthBarMarkers(
    markers: readonly BossHealthBarMarker[] | undefined,
): readonly BossHealthBarMarker[] {
    const normalized: BossHealthBarMarker[] = [];
    const seenBasisPoints = new Set<number>();
    for (const marker of markers ?? []) {
        if (!marker || !Number.isFinite(marker.percent)) continue;
        const basisPoints = Math.round(marker.percent * 100);
        if (basisPoints <= 0 || basisPoints >= 10_000 || seenBasisPoints.has(basisPoints)) {
            continue;
        }
        seenBasisPoints.add(basisPoints);
        const rawLabel =
            typeof marker.label === "string"
                ? marker.label.replaceAll("\0", "").trim()
                : "";
        const label = rawLabel
            ? rawLabel.slice(0, BOSS_HEALTH_BAR_MAX_MARKER_LABEL_LENGTH)
            : undefined;
        const style = BOSS_HEALTH_BAR_MARKER_STYLES.includes(
            marker.style as BossHealthBarMarkerStyle,
        )
            ? marker.style
            : undefined;
        normalized.push({
            percent: basisPoints / 100,
            ...(label ? { label } : {}),
            ...(style ? { style } : {}),
        });
    }
    normalized.sort((first, second) => second.percent - first.percent);
    return Object.freeze(
        normalized
            .slice(0, BOSS_HEALTH_BAR_MAX_MARKERS)
            .map((marker) => Object.freeze(marker)),
    );
}

export function bossHealthBarMarkerStyleToId(
    style: BossHealthBarMarkerStyle | undefined,
): number {
    const index = BOSS_HEALTH_BAR_MARKER_STYLES.indexOf(
        style as BossHealthBarMarkerStyle,
    );
    return index < 0 ? 0 : index + 1;
}

export function bossHealthBarMarkerStyleFromId(
    id: number,
): BossHealthBarMarkerStyle | undefined {
    return BOSS_HEALTH_BAR_MARKER_STYLES[Math.trunc(id) - 1];
}

export function bossHealthBarUid(componentId: number): number {
    return (BOSS_HEALTH_BAR_GROUP_ID << 16) | (componentId & 0xffff);
}

export function normalizeBossHealth(current: number, maximum: number): {
    current: number;
    maximum: number;
    percent: number;
} {
    const normalizedMaximum = Number.isFinite(maximum)
        ? Math.max(1, Math.trunc(maximum))
        : 1;
    const finiteCurrent = Number.isFinite(current) ? Math.trunc(current) : 0;
    const normalizedCurrent = Math.max(
        0,
        Math.min(normalizedMaximum, finiteCurrent),
    );
    return {
        current: normalizedCurrent,
        maximum: normalizedMaximum,
        percent: Math.round((normalizedCurrent / normalizedMaximum) * 100),
    };
}

/** Legacy formatter used only if cache group 303 is opened independently. */
export function formatBossHealthValue(current: number, maximum: number): string {
    const health = normalizeBossHealth(current, maximum);
    return `${health.current}/${health.maximum} | ${health.percent}%`;
}
