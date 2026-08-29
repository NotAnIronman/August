import assert from "node:assert/strict";

import { DisplayMode } from "../src/widgets/viewport";
import { ViewportEnumService, ViewportEnumIds, BaseComponentUids } from "../src/widgets/viewport/ViewportEnumService";

// A fake EnumTypeLoader that only defines a mapping for the RESIZABLE enum,
// mirroring a cache where the boss-hud slot is only wired up for that one
// display mode - the exact scenario that made the bar "work sometimes".
function makeEnumLoader(mappedEnumIds: Set<number>) {
    return {
        load: (enumId: number) => {
            if (!mappedEnumIds.has(enumId)) return undefined;
            return {
                outputCount: 1,
                keys: [BaseComponentUids.HPBAR_HUD],
                intValues: [(161 << 16) | 44],
            };
        },
    } as never;
}

// Only the RESIZABLE enum has a boss-hud entry.
const service = new ViewportEnumService(makeEnumLoader(new Set([ViewportEnumIds.RESIZABLE])));

// Issue #3: resizable mode has a real mapping.
assert.equal(service.hasComponent(BaseComponentUids.HPBAR_HUD, DisplayMode.RESIZABLE_NORMAL), true);

// Every other display mode's enum has no boss-hud entry in this fixture -
// hasComponent must report that honestly rather than letting getComponent's
// silent baseUid fallback hide it.
assert.equal(service.hasComponent(BaseComponentUids.HPBAR_HUD, DisplayMode.FIXED), false);
assert.equal(service.hasComponent(BaseComponentUids.HPBAR_HUD, DisplayMode.MOBILE), false);
assert.equal(service.hasComponent(BaseComponentUids.HPBAR_HUD, DisplayMode.RESIZABLE_LIST), false);
assert.equal(service.hasComponent(BaseComponentUids.HPBAR_HUD, DisplayMode.FULLSCREEN), false);

// getComponent's existing fallback behavior is unchanged (still returns
// baseUid when unmapped) - hasComponent is purely an additive diagnostic,
// not a behavior change, so nothing that already relies on the fallback
// silently breaks.
assert.equal(
    service.getComponent(BaseComponentUids.HPBAR_HUD, DisplayMode.FIXED),
    BaseComponentUids.HPBAR_HUD,
);
assert.equal(
    service.getComponent(BaseComponentUids.HPBAR_HUD, DisplayMode.RESIZABLE_NORMAL),
    (161 << 16) | 44,
);

console.log("viewport-enum-boss-hud (issue #3) tests passed");
