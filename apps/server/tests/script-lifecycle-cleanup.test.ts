import assert from "node:assert/strict";

import { GameEventBus } from "@server/game/events/GameEventBus";
import type { PlayerState } from "@server/game/player";
import {
    registerPlayerDialogSessions,
    registerPlayerScopedCollections,
    removeTrackedPlayerNpc,
} from "@server/game/scripts/ScriptLifecycle";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { ScriptScheduler } from "@server/game/systems/ScriptScheduler";

const eventBus = new GameEventBus();
const registry = new ScriptRegistry();
const services = {
    hotReloadEnabled: true,
    system: { eventBus },
} as unknown as ScriptServices;
const scheduler = new ScriptScheduler();
const runtime = new ScriptRuntime({
    registry,
    scheduler,
    services,
    logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
    },
});

const state = new Map<number, string>();
const registerState = (): void => {
    runtime.registerHandlers("player-state", (scripts, scriptServices) => {
        registerPlayerScopedCollections(scripts, scriptServices, state);
    });
};

registerState();
state.set(1, "first");
state.set(2, "second");
eventBus.emit("player:logout", { playerId: 1, username: "one" });
assert.equal(state.has(1), false, "logout must release only the departing player's state");
assert.equal(state.get(2), "second");

registerState();
assert.equal(state.size, 0, "hot reload must clear state owned by the previous provider");
assert.equal(
    eventBus.listenerCount("player:logout"),
    2,
    "hot reload must replace, rather than accumulate, the provider lifecycle listener",
);

const taskExecutions: string[] = [];
scheduler.scheduleAt(1, () => taskExecutions.push("departed"), undefined, {
    kind: "player",
    id: 2,
});
scheduler.scheduleAt(1, () => taskExecutions.push("active"), undefined, {
    kind: "player",
    id: 3,
});
eventBus.emit("player:logout", { playerId: 2, username: "two" });
scheduler.process(1);
assert.deepEqual(
    taskExecutions,
    ["active"],
    "logout must cancel delayed work owned by a departing player without affecting others",
);

state.set(3, "third");
runtime.reset();
assert.equal(state.size, 0, "runtime reset must clear provider-owned state");
assert.equal(eventBus.listenerCount("player:logout"), 0);

state.set(4, "rollback");
assert.throws(
    () =>
        runtime.registerHandlers("broken-state", (scripts, scriptServices) => {
            registerPlayerScopedCollections(scripts, scriptServices, state);
            throw new Error("registration failed");
        }),
    /registration failed/,
);
assert.equal(state.size, 0, "registration rollback must clean resources already acquired");
assert.equal(
    eventBus.listenerCount("player:logout"),
    1,
    "registration rollback must leave only the runtime-level task lifecycle listener",
);
runtime.reset();
assert.equal(eventBus.listenerCount("player:logout"), 0);

let cleanupCalls = 0;
const cleanup = registry.registerCleanup(() => {
    cleanupCalls += 1;
});
cleanup.unregister();
cleanup.unregister();
assert.equal(cleanupCalls, 1, "cleanup registration must be idempotent");

const legacyState = new Map<number, string>([[9, "registration fixture"]]);
assert.doesNotThrow(() =>
    registerPlayerScopedCollections({} as IScriptRegistry, undefined, legacyState),
);
assert.equal(
    legacyState.size,
    1,
    "a registry without lifecycle ownership must not mutate fixture state during registration",
);
const unownedEventBus = new GameEventBus();
registerPlayerScopedCollections(
    {} as IScriptRegistry,
    { system: { eventBus: unownedEventBus } } as unknown as ScriptServices,
    legacyState,
);
assert.equal(
    unownedEventBus.listenerCount("player:logout"),
    0,
    "a lightweight registry must not acquire a subscription it cannot later release",
);

let cleanupOnlyDisposer: (() => void) | undefined;
const cleanupOnlyRegistry = {
    registerCleanup: (disposer: () => void) => {
        cleanupOnlyDisposer = disposer;
        return { unregister: disposer };
    },
} as unknown as IScriptRegistry;
const legacyDialogSessions = new Map([[10, { id: 10 } as PlayerState]]);
registerPlayerDialogSessions(cleanupOnlyRegistry, undefined, legacyDialogSessions);
assert.doesNotThrow(() => cleanupOnlyDisposer?.());
assert.equal(
    legacyDialogSessions.size,
    0,
    "provider cleanup must still release state when a lightweight fixture omits services",
);

const removedNpcIds: number[] = [];
const npcServices = {
    combat: {
        getNpc: (npcId: number) => ({ id: npcId, ownerPlayerId: 12 }),
    },
    npc: {
        removeNpc: (npcId: number) => {
            removedNpcIds.push(npcId);
            return true;
        },
    },
} as unknown as ScriptServices;
assert.equal(
    removeTrackedPlayerNpc(npcServices, 11, 900),
    false,
    "stale ids must not remove an NPC now owned by a different player",
);
assert.equal(removeTrackedPlayerNpc(npcServices, 12, 900), true);
assert.deepEqual(removedNpcIds, [900]);

console.log("script lifecycle cleanup regression test passed");
