import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import type { WebSocket } from "ws";

import type { ServerServices } from "@server/game/ServerServices";
import type { PlayerState } from "@server/game/player";
import { PlayerInstanceGraveState } from "@server/game/state/PlayerInstanceGraveState";
import { PlayerRaidState } from "@server/game/state/PlayerRaidState";
import { LoginHandshakeService } from "@server/network/LoginHandshakeService";

const events: string[] = [];
const instanceGrave = new PlayerInstanceGraveState();
const player = {
    id: 77,
    name: "Disconnecting Player",
    __saveKey: "disconnecting_player",
    instanceGrave,
    raidProgress: new PlayerRaidState(),
    widgets: {
        closeAll: () => [],
        setDispatcher: () => undefined,
    },
} as unknown as PlayerState;

const emitter = new EventEmitter();
const socket = emitter as unknown as WebSocket;
let persistedGrave = player.instanceGrave.serialize();

const services = {
    tickMs: 600,
    playerSyncSessions: new Map(),
    npcSyncSessions: new Map(),
    playerDynamicLocSceneKeys: new Map(),
    networkLayer: {
        withDirectSendBypass: (_context: string, action: () => void) => action(),
        sendWithGuard: () => undefined,
    },
    clientInputService: {
        registerConnection: () => undefined,
        removeConnection: () => undefined,
        hasQueued: () => false,
    },
    movementService: {
        getPendingWalkCommands: () => new Map(),
    },
    players: {
        get: (candidate: WebSocket) => (candidate === socket ? player : undefined),
        orphanPlayer: () => {
            events.push("orphan");
            return true;
        },
    },
    playerDeathService: {
        forceCompleteDeath: (playerId: number) => {
            assert.equal(playerId, player.id);
            events.push("force-complete");
            player.instanceGrave.store([{ itemId: 532, quantity: 3 }]);
            return true;
        },
    },
    playerPersistence: {
        saveSnapshot: (saveKey: string, savedPlayer: PlayerState) => {
            assert.equal(saveKey, player.__saveKey);
            assert.equal(savedPlayer, player);
            persistedGrave = savedPlayer.instanceGrave.serialize();
            events.push("save");
        },
    },
    interfaceManager: { clearUiTrackingForPlayer: () => undefined },
    widgetDialogHandler: { cleanupPlayerDialogState: () => undefined },
    scriptRuntime: {
        getServices: () => ({ widgetCloseHandlers: new Map() }),
    },
    worldEntityInfoEncoder: {
        removePlayer: () => events.push("world-remove"),
    },
    ticker: { currentTick: () => 100 },
} as unknown as ServerServices;

const service = new LoginHandshakeService(services);
service.onConnection(socket);
emitter.emit("close");

assert.deepEqual(persistedGrave?.items, [{ itemId: 532, quantity: 3 }]);
assert.deepEqual(
    events,
    ["force-complete", "save", "world-remove", "orphan"],
    "the completed death and grave must be persisted before disconnect removal/orphaning",
);

console.log("disconnect death persistence regression test passed");

// A live Theatre disconnect must save eligibility and dispose the instance
// before the ordinary logout snapshot, even when combat would orphan a player.
events.length=0;
player.raidProgress.set({version:1,raid:"theatre-of-blood",runId:"disconnect-test",completedRooms:2,
    access:"party",roster:["disconnecting_player"],status:"active"});
const mutable=services as any;
mutable.playerDeathService.forceCompleteDeath=()=>false;
mutable.instancedAreaManager={get:()=>({definitionId:"theatre-of-blood:disconnect-test:2"}),dispose:()=>{
    assert.equal(player.raidProgress.checkpoint?.status,"disconnected");
    assert(player.raidProgress.isInternal,"disconnect cleanup must bypass voluntary-leave confirmation");
    events.push("dispose");
}};
mutable.playerPersistence.saveSnapshot=()=>{
    assert.equal(player.raidProgress.checkpoint?.status,"disconnected");events.push("save-disconnected");
};
mutable.locationService={clearTemporaryLocsOwnedByPlayer:()=>{}};
mutable.eventBus={emit:()=>{}};
mutable.players.remove=()=>events.push("remove");
mutable.actionScheduler={unregisterPlayer:()=>{}};
emitter.emit("close");
assert.deepEqual(events,["dispose","world-remove","save-disconnected","remove"]);
console.log("Theatre real socket-close checkpoint/disposal/save order passed");
