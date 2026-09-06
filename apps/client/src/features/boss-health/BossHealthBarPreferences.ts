import {
    createBrowserJsonPersistence,
    type BrowserJsonPersistence,
} from "@client/core/storage/localStorage";

export type BossHealthBarStyle = "modern" | "oldschool" | "none";

interface StoredBossHealthBarPreferences {
    readonly version: 1;
    readonly style: BossHealthBarStyle;
}

type BossHealthBarPreferencesPersistence = BrowserJsonPersistence<
    Partial<StoredBossHealthBarPreferences>,
    StoredBossHealthBarPreferences
>;

type BossHealthBarPreferencesListener = () => void;

export const BOSS_HEALTH_BAR_PREFERENCES_STORAGE_KEY = "osrs.plugin.boss_health_bar.v1";
export const DEFAULT_BOSS_HEALTH_BAR_STYLE: BossHealthBarStyle = "oldschool";

export function normalizeBossHealthBarStyle(value: unknown): BossHealthBarStyle {
    return value === "modern" || value === "oldschool" || value === "none" ? value : DEFAULT_BOSS_HEALTH_BAR_STYLE;
}

/**
 * Small external store for presentation-only boss HUD preferences. Keeping this
 * independent from encounter state means changing style never mutates or waits
 * for an authoritative server health update.
 */
export class BossHealthBarPreferences {
    private readonly listeners = new Set<BossHealthBarPreferencesListener>();
    private readonly persistence?: BossHealthBarPreferencesPersistence;
    private style: BossHealthBarStyle;

    constructor(persistence?: BossHealthBarPreferencesPersistence) {
        this.persistence = persistence;
        this.style = normalizeBossHealthBarStyle(persistence?.load()?.style);
    }

    subscribe = (listener: BossHealthBarPreferencesListener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = (): BossHealthBarStyle => this.style;

    setStyle(style: BossHealthBarStyle): void {
        const next = normalizeBossHealthBarStyle(style);
        if (next === this.style) return;

        this.style = next;
        this.persistence?.save({ version: 1, style: next });
        for (const listener of this.listeners) {
            try {
                listener();
            } catch (error) {
                console.warn("[BossHealthBarPreferences] listener failed", error);
            }
        }
    }
}

export const bossHealthBarPreferences = new BossHealthBarPreferences(
    createBrowserJsonPersistence<
        Partial<StoredBossHealthBarPreferences>,
        StoredBossHealthBarPreferences
    >(BOSS_HEALTH_BAR_PREFERENCES_STORAGE_KEY),
);
