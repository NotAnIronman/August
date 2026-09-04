import {
    BOSS_HEALTH_BAR_MAX_MARKER_LABEL_LENGTH,
    BOSS_HEALTH_BAR_MAX_MARKERS,
    normalizeBossHealth,
    normalizeBossHealthBarMarkers,
    type BossHealthBarMarker,
    type BossHealthBarMarkerStyle,
    type BossHealthBarState,
} from "@august/protocol/ui/bossHealthBar";

export type BossHealthHudMarkerStyle = BossHealthBarMarkerStyle;

export interface BossHealthHudMarker {
    readonly percent: number;
    readonly label?: string;
    readonly style: BossHealthHudMarkerStyle;
}

export type BossHealthHudMarkerInput = BossHealthBarMarker;
export type ActiveBossHealthHudUpdate = Extract<BossHealthBarState, { readonly active: true }>;
export type BossHealthHudUpdate = BossHealthBarState;

export interface BossHealthHudState {
    readonly active: boolean;
    readonly npcTypeId: number;
    readonly name: string;
    readonly current: number;
    readonly maximum: number;
    /** Rounded percentage used for the text readout and accessibility value. */
    readonly percent: number;
    /** Unrounded percentage used for smooth, accurate bar geometry. */
    readonly precisePercent: number;
    readonly markers: readonly BossHealthHudMarker[];
    readonly revision: number;
}

type BossHealthHudListener = () => void;

const EMPTY_MARKERS: readonly BossHealthHudMarker[] = Object.freeze([]);
const MAX_NAME_LENGTH = 80;

const INITIAL_STATE: BossHealthHudState = Object.freeze({
    active: false,
    npcTypeId: -1,
    name: "",
    current: 0,
    maximum: 1,
    percent: 0,
    precisePercent: 0,
    markers: EMPTY_MARKERS,
    revision: 0,
});

function normalizeDisplayText(raw: unknown, maximumLength: number): string {
    if (typeof raw !== "string") return "";
    return raw
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maximumLength);
}

/**
 * Sanitizes content-authored gates before they reach layout. Markers at 0% and
 * 100% are omitted because they duplicate the ends of the health bar.
 */
export function normalizeBossHealthHudMarkers(
    inputs: readonly BossHealthHudMarkerInput[] | undefined,
): readonly BossHealthHudMarker[] {
    if (!Array.isArray(inputs) || inputs.length === 0) return EMPTY_MARKERS;

    const sharedMarkers = normalizeBossHealthBarMarkers(inputs);
    if (sharedMarkers.length === 0) return EMPTY_MARKERS;
    return Object.freeze(
        sharedMarkers.slice(0, BOSS_HEALTH_BAR_MAX_MARKERS).map((marker) => {
            const label = normalizeDisplayText(
                marker.label,
                BOSS_HEALTH_BAR_MAX_MARKER_LABEL_LENGTH,
            );
            return Object.freeze({
                percent: marker.percent,
                ...(label ? { label } : {}),
                style: marker.style ?? "mechanic",
            });
        }),
    );
}

function markersEqual(
    left: readonly BossHealthHudMarker[],
    right: readonly BossHealthHudMarker[],
): boolean {
    if (left === right) return true;
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) {
        const a = left[index];
        const b = right[index];
        if (a.percent !== b.percent || a.label !== b.label || a.style !== b.style) return false;
    }
    return true;
}

function precisePercent(current: number, maximum: number): number {
    if (maximum <= 0) return 0;
    return Math.max(0, Math.min(100, (current / maximum) * 100));
}

export function getNextBossHealthHudMarker(
    markers: readonly BossHealthHudMarker[],
    currentPercent: number,
): BossHealthHudMarker | undefined {
    const normalizedCurrent = Number.isFinite(currentPercent)
        ? Math.max(0, Math.min(100, currentPercent))
        : 0;
    return markers.find((marker) => marker.percent < normalizedCurrent);
}

/** Hue on the CSS HSL wheel: red at empty, yellow midway, green at full. */
export function getBossHealthHudHue(percent: number): number {
    const normalized = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    return Math.round(normalized * 1.2);
}

/** Keeps low-health progress useful without showing a living boss as 0%. */
export function formatBossHealthHudPercent(precisePercentValue: number): string {
    const normalized = Number.isFinite(precisePercentValue)
        ? Math.max(0, Math.min(100, precisePercentValue))
        : 0;
    if (normalized <= 0) return "0%";
    if (normalized < 10) {
        const rounded = Math.min(9.9, Math.max(0.1, Math.round(normalized * 10) / 10));
        return `${rounded.toFixed(1)}%`;
    }
    return `${normalized < 100 ? Math.min(99, Math.round(normalized)) : 100}%`;
}

/**
 * External-store bridge between packet state and React. It retains one
 * immutable snapshot, replays that snapshot to remounted views, and makes
 * reset/hide explicit so disconnects cannot leak a previous encounter.
 */
export class BossHealthHudStore {
    private readonly listeners = new Set<BossHealthHudListener>();
    private state: BossHealthHudState = INITIAL_STATE;

    subscribe = (listener: BossHealthHudListener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getState = (): BossHealthHudState => this.state;

    ingest(update: BossHealthHudUpdate): void {
        if (!update.active) {
            this.hide();
            return;
        }

        const health = normalizeBossHealth(update.current, update.maximum);
        const markers = normalizeBossHealthHudMarkers(update.markers);
        this.commit({
            active: true,
            npcTypeId: Number.isFinite(update.npcTypeId)
                ? Math.max(0, Math.trunc(update.npcTypeId))
                : 0,
            name: normalizeDisplayText(update.name, MAX_NAME_LENGTH) || "Boss",
            current: health.current,
            maximum: health.maximum,
            percent: health.percent,
            precisePercent: precisePercent(health.current, health.maximum),
            markers,
        });
    }

    hide(): void {
        if (!this.state.active) return;
        this.state = Object.freeze({
            ...INITIAL_STATE,
            revision: this.state.revision + 1,
        });
        this.emit();
    }

    reset(): void {
        this.hide();
    }

    private commit(next: Omit<BossHealthHudState, "revision"> | BossHealthHudState): void {
        const current = this.state;
        if (
            current.active === next.active &&
            current.npcTypeId === next.npcTypeId &&
            current.name === next.name &&
            current.current === next.current &&
            current.maximum === next.maximum &&
            current.percent === next.percent &&
            current.precisePercent === next.precisePercent &&
            markersEqual(current.markers, next.markers)
        ) {
            return;
        }

        this.state = Object.freeze({
            ...next,
            markers: Object.freeze([...next.markers]),
            revision: current.revision + 1,
        });
        this.emit();
    }

    private emit(): void {
        for (const listener of this.listeners) {
            try {
                listener();
            } catch (error) {
                console.warn("[BossHealthHud] listener failed", error);
            }
        }
    }
}
