import assert from "node:assert/strict";

import { secondsToTicks } from "@server/game/scripts/timing";
import type { ScriptServices } from "@server/game/scripts/types";

const servicesAt = (tickMs?: number): Pick<ScriptServices, "system"> =>
    ({
        system: {
            getTickDurationMs: tickMs === undefined ? undefined : () => tickMs,
        },
    }) as Pick<ScriptServices, "system">;

assert.equal(secondsToTicks(servicesAt(600), 12), 20);
assert.equal(secondsToTicks(servicesAt(300), 12), 40);
assert.equal(secondsToTicks(servicesAt(1_000), 0.5), 1);
assert.equal(secondsToTicks(servicesAt(), 12), 20);
assert.equal(secondsToTicks(servicesAt(600), undefined), 0);
assert.equal(secondsToTicks(servicesAt(600), Number.NaN), 0);

console.log("script timing tests passed");
