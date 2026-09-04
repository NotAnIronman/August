import assert from "node:assert/strict";

import { WebSocket } from "ws";

import type { ServerServices } from "@server/game/ServerServices";
import { ClientInputService } from "@server/game/services/ClientInputService";

const socket = {
    readyState: WebSocket.OPEN,
} as WebSocket;
const services = {
    players: {
        get: () => undefined,
    },
} as unknown as ServerServices;

let handled = 0;
const input = new ClientInputService(services, () => 1_000);
input.registerConnection(socket, () => {
    handled++;
});
for (let index = 0; index < 100; index++) {
    input.enqueue(socket, Buffer.from([index & 0xff]));
}
input.drain();
assert.equal(handled, 30);

// The cap applies per tick: draining frees the next bounded queue.
for (let index = 0; index < 5; index++) {
    input.enqueue(socket, Buffer.from([index]));
}
input.drain();
assert.equal(handled, 35);

input.removeConnection(socket);

let byteCappedHandled = 0;
const byteCappedInput = new ClientInputService(services, () => 1_000, 8);
byteCappedInput.registerConnection(socket, () => {
    byteCappedHandled++;
});
byteCappedInput.enqueue(socket, Buffer.alloc(5));
byteCappedInput.enqueue(socket, Buffer.alloc(4));
byteCappedInput.drain();
assert.equal(byteCappedHandled, 1);

// Draining resets the byte budget, including for fragmented RawData payloads.
byteCappedInput.enqueue(socket, [Buffer.alloc(3), Buffer.alloc(5)]);
byteCappedInput.drain();
assert.equal(byteCappedHandled, 2);
byteCappedInput.removeConnection(socket);

console.log("client input queue cap regression test passed");
