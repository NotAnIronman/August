import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

import { ServerMessageId } from "@august/protocol/transport/messages/ServerMessage";
import {
    MAX_BATCHED_SERVER_PACKETS,
    MAX_GAMEMODE_DATA_JSON_BYTES,
    decodeBatchedServerPackets,
    decodeServerPacket,
} from "@client/core/network/packet/ServerBinaryDecoder";

function gamemodePacket(json: Uint8Array, compressed: Uint8Array, declaredLength = json.length): Uint8Array {
    const payloadLength = 5 + compressed.length;
    const packet = new Uint8Array(3 + payloadLength);
    packet[0] = ServerMessageId.GAMEMODE_DATA;
    packet[1] = (payloadLength >>> 8) & 0xff;
    packet[2] = payloadLength & 0xff;
    packet[3] = compressed === json ? 0 : 1;
    packet[4] = (declaredLength >>> 24) & 0xff;
    packet[5] = (declaredLength >>> 16) & 0xff;
    packet[6] = (declaredLength >>> 8) & 0xff;
    packet[7] = declaredLength & 0xff;
    packet.set(compressed, 8);
    return packet;
}

assert.deepEqual(
    decodeServerPacket(new Uint8Array([ServerMessageId.WELCOME, 0, 0, 0, 0, 0, 0, 0, 0])),
    { type: "welcome", payload: { tickMs: 0, serverTime: 0 } },
);

// A terminator in a trailing packet is outside this packet's declared payload.
assert.equal(
    decodeServerPacket(
        new Uint8Array([ServerMessageId.HANDSHAKE, 5, 0, 0, 0, 1, 97, 0]),
    ),
    null,
);
assert.equal(
    decodeServerPacket(new Uint8Array([ServerMessageId.VARP_SMALL, 0, 0])),
    null,
);
assert.equal(decodeServerPacket(new Uint8Array([255])), null);

const json = new TextEncoder().encode('{"mode":"ok"}');
const compressed = new Uint8Array(deflateSync(json));
assert.deepEqual(decodeServerPacket(gamemodePacket(json, compressed)), {
    type: "gamemode_data",
    payload: { mode: "ok" },
});

assert.equal(
    decodeServerPacket(gamemodePacket(new Uint8Array(), new Uint8Array(), MAX_GAMEMODE_DATA_JSON_BYTES + 1)),
    null,
);

// A tiny deflate payload must not be allowed to expand beyond its claimed size.
const expansion = new TextEncoder().encode(`{"value":"${"x".repeat(100_000)}"}`);
assert.equal(
    decodeServerPacket(gamemodePacket(expansion, new Uint8Array(deflateSync(expansion)), 1)),
    null,
);

assert.deepEqual(
    decodeBatchedServerPackets(
        new Uint8Array(MAX_BATCHED_SERVER_PACKETS + 1).fill(ServerMessageId.SHOP_CLOSE),
    ),
    [],
);

console.log("server packet boundary regression tests passed");
