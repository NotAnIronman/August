export const MOON_NAMES = ["blood", "eclipse", "blue"] as const;
export type MoonName = typeof MOON_NAMES[number];
export function sanitizeMoonProgress(value: unknown): number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 7 ? value : 0;
}

/** Completed fights survive logout/restart; live actors and instances never do. */
export class PlayerMoonState {
    readonly defeated = new Set<MoonName>();
    serialize(): number { return MOON_NAMES.reduce((mask, moon, i) => mask | (this.defeated.has(moon) ? 1 << i : 0), 0); }
    deserialize(raw: unknown): void {
        this.defeated.clear();
        const mask = sanitizeMoonProgress(raw);
        MOON_NAMES.forEach((moon, i) => { if (mask & (1 << i)) this.defeated.add(moon); });
    }
}
