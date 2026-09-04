import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { LocType } from "@august/osrs-engine/config/loctype/LocType";
import type { LocTypeLoader } from "@august/osrs-engine/config/loctype/LocTypeLoader";

/** Reviewed chest IDs with server-owned picklock definitions; never match by name alone. */
export const PICKLOCK_CHEST_OPTION_IDS: ReadonlySet<number> = new Set([11735, 11736, 11737]);

/** The same opt-in menu alias is used by the browser and authoritative option validation. */
export class ThievingLocTypeLoader implements LocTypeLoader {
    private readonly overrides = new Map<number, LocType>();

    constructor(private readonly base: LocTypeLoader, private readonly cacheInfo: CacheInfo) {}

    load(id: number): LocType {
        const cached = this.overrides.get(id);
        if (cached) return cached;
        const source = this.base.load(id);
        if (this.cacheInfo.game !== "oldschool" || !PICKLOCK_CHEST_OPTION_IDS.has(id) ||
            source.name.toLowerCase() !== "chest" ||
            source.actions.some((action) => /^pick[- ]?lock$/i.test(action ?? ""))) return source;
        const slot = Array.from({ length: 5 }, (_, index) => index).find((index) => !source.actions[index]);
        if (slot === undefined) return source;
        const clone = Object.assign(new LocType(id, this.cacheInfo), source);
        clone.actions = [...source.actions];
        clone.actions[slot] = "Pick-lock";
        this.overrides.set(id, clone);
        return clone;
    }

    getCount(): number { return this.base.getCount(); }

    clearCache(): void {
        this.overrides.clear();
        this.base.clearCache();
    }
}
