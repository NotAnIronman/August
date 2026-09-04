import assert from "node:assert/strict";

import { register as registerBossKillcounts } from "@server/content/modules/boss-killcounts/index";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";
import type { ScriptServices } from "@server/game/scripts/types";
import { ScriptScheduler } from "@server/game/systems/ScriptScheduler";

type KillListener = (killer: PlayerState, npc: NpcState, tick: number) => void;

const listeners = new Set<KillListener>();
let deliveries = 0;
const services = {
    hotReloadEnabled: true,
    combat: {
        registerOnNpcKilled: (listener: KillListener) => {
            const instrumented: KillListener = (killer, npc, tick) => {
                deliveries += 1;
                listener(killer, npc, tick);
            };
            listeners.add(instrumented);
            let active = true;
            return () => {
                if (!active) return;
                active = false;
                listeners.delete(instrumented);
            };
        },
    },
} as unknown as ScriptServices;
const runtime = new ScriptRuntime({
    registry: new ScriptRegistry(),
    scheduler: new ScriptScheduler(),
    services,
    logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
    },
});

const registerProvider = (): void => {
    runtime.registerHandlers("module.boss-killcounts", registerBossKillcounts);
};
const dispatchKill = (): void => {
    const player = { id: 1 } as PlayerState;
    // An unknown type deliberately makes the content listener a no-op after
    // delivery; this test owns only listener lifecycle, not killcount policy.
    const npc = { id: 2, typeId: -1 } as NpcState;
    for (const listener of [...listeners]) listener(player, npc, 100);
};

registerProvider();
assert.equal(listeners.size, 1);
dispatchKill();
assert.equal(deliveries, 1);

registerProvider();
assert.equal(
    listeners.size,
    1,
    "hot reload must dispose the previous provider's confirmed-kill listener",
);
dispatchKill();
assert.equal(
    deliveries,
    2,
    "one confirmed kill must reach exactly one current-provider listener after reload",
);

runtime.reset();
assert.equal(listeners.size, 0, "runtime reset must release confirmed-kill listeners");
dispatchKill();
assert.equal(deliveries, 2);

console.log("NPC kill listener lifecycle regression test passed");
