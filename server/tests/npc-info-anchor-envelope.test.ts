import assert from "node:assert/strict";

import { decodeServerPacket } from "../../client/network/packet/ServerBinaryDecoder";
import { encodeMessage } from "../src/network/messages";

const packet = Uint8Array.from([0xaa, 0x55, 0x01]);
const decoded = decodeServerPacket(
    encodeMessage({
        type: "npc_info",
        payload: {
            loopCycle: 1234,
            large: false,
            anchorX: 2864,
            anchorY: 5354,
            anchorLevel: 2,
            packet: [...packet],
        },
    }),
);

assert.equal(decoded?.type, "npc_info");
if (decoded?.type !== "npc_info") throw new Error("NPC info packet did not decode");
assert.equal(decoded.payload.loopCycle, 1234);
assert.equal(decoded.payload.anchorX, 2864);
assert.equal(decoded.payload.anchorY, 5354);
assert.equal(decoded.payload.anchorLevel, 2);
assert.deepEqual([...decoded.payload.packet], [...packet]);

console.log("npc info anchor envelope tests passed");
