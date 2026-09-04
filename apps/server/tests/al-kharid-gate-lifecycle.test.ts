import assert from "node:assert/strict";

import type { PlayerState } from "@server/game/player";
import { GameEventBus } from "@server/game/events/GameEventBus";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";
import type { LocInteractionEvent, ScriptServices } from "@server/game/scripts/types";
import { ScriptScheduler } from "@server/game/systems/ScriptScheduler";
import { registerAlKharidBorderHandlers } from "@server/content/gamemodes/vanilla/scripts/content/alKharidBorder";

const eventBus = new GameEventBus();
const registry = new ScriptRegistry();
let currentTick = 10;
const gateActions: string[] = [];
let releaseMovementCalls = 0;

const services = {
    system: {
        eventBus,
        getCurrentTick: () => currentTick,
    },
    location: {
        resolveLocTransformId: () => 44050,
        doorManager: {
            toggleExplicitGate: ({ action }: { action: string }) => {
                gateActions.push(action);
                if (action === "open") {
                    return {
                        success: true,
                        newLocId: 1571,
                        newTile: { x: 3267, y: 3227 },
                        oldRotation: 0,
                        newRotation: 1,
                        soundId: 62,
                        partnerResult: {
                            oldLocId: 44051,
                            newLocId: 1572,
                            oldTile: { x: 3268, y: 3228 },
                            newTile: { x: 3268, y: 3227 },
                            oldRotation: 0,
                            newRotation: 3,
                        },
                    };
                }
                return {
                    success: true,
                    newLocId: 44050,
                    newTile: { x: 3268, y: 3227 },
                    oldRotation: 1,
                    newRotation: 0,
                    soundId: 60,
                    partnerResult: {
                        oldLocId: 1572,
                        newLocId: 44051,
                        oldTile: { x: 3268, y: 3227 },
                        newTile: { x: 3268, y: 3228 },
                        oldRotation: 3,
                        newRotation: 0,
                    },
                };
            },
        },
        emitLocChange: () => undefined,
    },
    sound: { playAreaSound: () => undefined },
    inventory: {
        getInventoryItems: () => [],
        setInventorySlot: () => undefined,
        snapshotInventory: () => undefined,
        addItemToInventory: () => ({ slot: 0, added: 0 }),
    },
    messaging: { sendGameMessage: () => undefined },
    dialog: {
        openDialog: () => undefined,
        openDialogOptions: () => undefined,
        closeDialog: () => undefined,
    },
    movement: { getPathService: () => undefined },
    data: { getLocDefinition: () => undefined },
} as unknown as ScriptServices;

const runtime = new ScriptRuntime({
    registry,
    scheduler: new ScriptScheduler(),
    services,
    logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
    },
});
runtime.registerHandlers("al-kharid-gate", (scripts) =>
    registerAlKharidBorderHandlers(scripts, services),
);

const player = {
    id: 55,
    name: "Gate tester",
    tileX: 3267,
    tileY: 3227,
    level: 0,
    energy: {
        wantsToRun: () => false,
        resolveRequestedRun: () => false,
    },
    clearWalkDestination: () => undefined,
    holdMovementUntil: () => undefined,
    releaseMovementHold: () => {
        releaseMovementCalls += 1;
    },
    resetInteractions: () => undefined,
    setPath: () => undefined,
    getWalkDestination: () => undefined,
    hasPath: () => false,
} as unknown as PlayerState;
const event = {
    player,
    locId: 44598,
    tile: { x: 3268, y: 3227 },
    level: 0,
    action: "open",
    tick: currentTick,
    services,
} as LocInteractionEvent;
const openGate = registry.findLocInteraction(44598, "open");
assert.ok(openGate);

openGate(event);
eventBus.emit("player:logout", { playerId: player.id, username: player.name ?? "" });
assert.deepEqual(gateActions, [], "disconnecting during approach must not open the gate");
assert.equal(releaseMovementCalls, 1, "approach cleanup must release the movement hold");

openGate(event);
currentTick = 11;
for (const tickHandler of registry.getTickHandlers()) {
    tickHandler({ tick: currentTick, services });
}
assert.deepEqual(gateActions, ["open"]);

runtime.reset();
assert.deepEqual(
    gateActions,
    ["open", "close"],
    "provider reset must close a globally-visible gate opened by an interrupted crossing",
);
assert.equal(releaseMovementCalls, 2, "crossing cleanup must release the movement hold");
assert.equal(eventBus.listenerCount("player:logout"), 0);

console.log("Al Kharid gate lifecycle regression test passed");
