import assert from "node:assert/strict";

import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";
import type { ScriptServices } from "@server/game/scripts/types";
import { ScriptScheduler } from "@server/game/systems/ScriptScheduler";

const registry = new ScriptRegistry();
const runtime = new ScriptRuntime({
    registry,
    scheduler: new ScriptScheduler(),
    services: { hotReloadEnabled: true } as unknown as ScriptServices,
    logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
    },
});

const baseHandler = () => undefined;
registry.registerNpcInteraction(4000, baseHandler, "talk-to");

assert.throws(
    () =>
        runtime.registerHandlers("broken-provider", (scripts) => {
            scripts.registerNpcInteraction(4000, () => undefined, "talk-to");
            scripts.registerLocInteraction(5000, () => undefined, "open");
            scripts.registerCommand("partially-loaded", () => undefined, {
                owner: "script-registration-rollback-test",
                permission: "player",
                summary: "Must disappear when the provider fails.",
            });
            throw new Error("invalid provider data");
        }),
    /invalid provider data/,
);

assert.equal(
    registry.findNpcInteractionDirect(4000, "talk-to"),
    baseHandler,
    "a failed provider must reveal the handler it temporarily shadowed",
);
assert.equal(
    registry.findLocInteraction(5000, "open"),
    undefined,
    "a failed provider must remove every interaction it registered",
);
assert.equal(
    registry.findCommand("partially-loaded"),
    undefined,
    "a failed provider must remove command registrations too",
);

runtime.registerHandlers("broken-provider", (scripts) => {
    scripts.registerLocInteraction(5000, () => undefined, "open");
});
assert.notEqual(
    registry.findLocInteraction(5000, "open"),
    undefined,
    "a provider id must remain reusable after a failed registration",
);

console.log("script registration rollback regression test passed");
