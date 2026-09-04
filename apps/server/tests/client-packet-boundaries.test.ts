import assert from "node:assert/strict";

import { ClientMessageId } from "@august/protocol/transport/messages/ClientMessage";
import { decodeClientPacket } from "@server/network/packet/ClientBinaryDecoder";

const validHello = new Uint8Array([
    ClientMessageId.HELLO,
    4,
    "a".charCodeAt(0),
    0,
    "b".charCodeAt(0),
    0,
]);
assert.deepEqual(decodeClientPacket(validHello), {
    type: "hello",
    payload: { client: "a", version: "b" },
});

// The terminator exists in the frame, but outside the declared payload. The
// decoder must not consume it (or any following packet) as part of this one.
assert.equal(
    decodeClientPacket(
        new Uint8Array([ClientMessageId.HELLO, 1, "a".charCodeAt(0), 0]),
    ),
    null,
);

// Previously readString() advanced forever after reaching the end of a packet
// with no NUL byte, eventually exhausting memory and crashing the process.
assert.equal(
    decodeClientPacket(
        new Uint8Array([
            ClientMessageId.LOGIN,
            0,
            3,
            "a".charCodeAt(0),
            "b".charCodeAt(0),
            "c".charCodeAt(0),
        ]),
    ),
    null,
);

assert.equal(
    decodeClientPacket(new Uint8Array([ClientMessageId.PING, 0, 0, 0])),
    null,
);
assert.equal(decodeClientPacket(new Uint8Array([181])), null);

console.log("client packet boundary regression tests passed");
