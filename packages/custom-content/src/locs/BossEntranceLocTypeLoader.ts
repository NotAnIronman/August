import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { LocType } from "@august/osrs-engine/config/loctype/LocType";
import type { LocTypeLoader } from "@august/osrs-engine/config/loctype/LocTypeLoader";
import { VARBIT_GUARDIANS_UNLOCKED } from "@august/game-model/world/BossAccess";

/** These entrances must exist independently of unimplemented quest/cutscene morph varbits. */
export class BossEntranceLocTypeLoader implements LocTypeLoader {
    private readonly overrides = new Map<number, LocType>();
    constructor(private readonly base: LocTypeLoader, private readonly info: CacheInfo) {}
    load(id: number): LocType {
        if (this.info.game !== "oldschool" || ![31681,31672,31673,58439].includes(id)) return this.base.load(id);
        let loc = this.overrides.get(id);
        if (!loc) {
            loc = Object.assign(new LocType(id, this.info), this.base.load(id === 58439 ? 58440 : id), { id });
            loc.transforms = undefined;
            loc.name = id === 58439 ? "Cave entrance" : "Roof entrance";
            loc.actions = id === 31672 ? ["Unlock"] : ["Open", "Peek", "Enter Solo", "Enter Party", "Join Party"];
            if (id === 31681) {
                loc.transformVarbit = VARBIT_GUARDIANS_UNLOCKED;
                loc.transformVarp = -1;
                loc.transforms = [31672,31673,31672];
            }
            this.overrides.set(id, loc);
        }
        return loc;
    }
    getCount(): number { return this.base.getCount(); }
    clearCache(): void { this.overrides.clear(); this.base.clearCache(); }
}
