import assert from "node:assert/strict";

import type { PlayerState } from "@server/game/player";
import type { ServerServices } from "@server/game/ServerServices";
import { GameEventBus } from "@server/game/events/GameEventBus";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";
import type { ScriptServices } from "@server/game/scripts/types";
import { TickPhaseService } from "@server/game/services/TickPhaseService";
import { ScriptScheduler } from "@server/game/systems/ScriptScheduler";
import type { TickFrame } from "@server/game/tick/TickPhaseOrchestrator";

const eventBus = new GameEventBus();
const scheduler = new ScriptScheduler();
const scriptServices = { system: { eventBus } } as unknown as ScriptServices;
const runtime = new ScriptRuntime({
    registry: new ScriptRegistry(),
    scheduler,
    services: scriptServices,
    logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
    },
});
runtime.registerHandlers("orphan-lifecycle-test", () => undefined);

const orphan = { id: 41, name: "Expired orphan" } as PlayerState;
const logoutEvents: Array<{ playerId: number; username: string }> = [];
eventBus.on("player:logout", ({ playerId, username }) => {
    logoutEvents.push({ playerId, username });
});

let delayedTaskRan = false;
scheduler.scheduleAt(101, () => {
    delayedTaskRan = true;
}, undefined, { kind: "player", id: orphan.id });

const cleanupCalls: string[] = [];
const serverServices = {
    players: {
        processOrphanedPlayers: (
            _tick: number,
            onRemove: (player: PlayerState, saveKey: string) => void,
        ) => onRemove(orphan, "expired-orphan"),
    },
    playerPersistence: {
        saveSnapshot: () => cleanupCalls.push("save"),
    },
    followerCombatManager: {
        resetPlayer: () => cleanupCalls.push("follower-combat"),
    },
    followerManager: {
        despawnFollowerForPlayer: () => cleanupCalls.push("follower"),
    },
    instancedAreaManager: {
        dispose: () => {
            cleanupCalls.push("instance");
            return false;
        },
    },
    npcManager: {
        removeNpcsOwnedByPlayer: () => cleanupCalls.push("npcs"),
    },
    locationService: {
        clearTemporaryLocsOwnedByPlayer: () => cleanupCalls.push("locs"),
    },
    actionScheduler: {
        unregisterPlayer: () => cleanupCalls.push("actions"),
    },
    eventBus,
} as unknown as ServerServices;

new TickPhaseService(serverServices).runOrphanedPlayersPhase({ tick: 100 } as TickFrame);
scheduler.process(101);

assert.deepEqual(logoutEvents, [{ playerId: 41, username: "Expired orphan" }]);
assert.equal(delayedTaskRan, false, "expired orphan logout must cancel player-owned script tasks");
assert.deepEqual(cleanupCalls, [
    "save",
    "follower-combat",
    "follower",
    "instance",
    "npcs",
    "locs",
    "actions",
]);

runtime.reset();
console.log("orphaned player script lifecycle regression test passed");
