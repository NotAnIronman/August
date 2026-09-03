import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import type { WebSocket } from "ws";

import type { ServerServices } from "@server/game/ServerServices";
import { LoginHandshakeService } from "@server/network/LoginHandshakeService";

const emitter = new EventEmitter();
const socket = emitter as unknown as WebSocket;
let scheduled: (() => void) | undefined;
let scheduledDelay = 0;
let cancelled = false;
let closeArgs: [number, string] | undefined;

Object.assign(socket, {
    close: (code: number, reason: string) => {
        closeArgs = [code, reason];
    },
});

const services = {
    tickMs: 600,
    players: { get: () => undefined },
    playerSyncSessions: new Map(),
    npcSyncSessions: new Map(),
    networkLayer: {
        withDirectSendBypass: (_context: string, action: () => void) => action(),
        sendWithGuard: () => undefined,
    },
    clientInputService: {
        registerConnection: () => undefined,
        removeConnection: () => undefined,
        hasQueued: () => false,
    },
    movementService: { getPendingWalkCommands: () => new Map() },
} as unknown as ServerServices;

const timeoutHandle = { unref: () => timeoutHandle } as unknown as NodeJS.Timeout;
const service = new LoginHandshakeService(services, Date.now, {
    preAuthTimeoutMs: 5_000,
    scheduleTimeout: (callback, delayMs) => {
        scheduled = callback;
        scheduledDelay = delayMs;
        return timeoutHandle;
    },
    cancelTimeout: (timeout) => {
        assert.equal(timeout, timeoutHandle);
        cancelled = true;
    },
});

service.onConnection(socket);
assert.equal(scheduledDelay, 5_000);
assert.ok(scheduled, "the connection must receive an authentication deadline");
scheduled?.();
assert.deepEqual(closeArgs, [1008, "authentication_timeout"]);

emitter.emit("close");
assert.equal(cancelled, false, "a deadline which already fired must not be cancelled twice");

console.log("pre-authentication connection timeout regression test passed");
