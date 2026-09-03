import assert from "node:assert/strict";

import {
    DEFAULT_WS_COMPRESSION_THRESHOLD_BYTES,
    DEFAULT_WS_INPUT_QUEUE_HIGH_WATER_BYTES,
    DEFAULT_WS_MAX_PAYLOAD_BYTES,
    DEFAULT_WS_OUTBOUND_HIGH_WATER_BYTES,
    MAX_WS_MAX_PAYLOAD_BYTES,
    MIN_WS_MAX_PAYLOAD_BYTES,
    resolveWebSocketTransportConfig,
} from "@server/network/WebSocketTransportConfig";

const defaults = resolveWebSocketTransportConfig({}, {});
assert.equal(defaults.maxPayloadBytes, DEFAULT_WS_MAX_PAYLOAD_BYTES);
assert.equal(defaults.compressionEnabled, true);
assert.equal(defaults.compressionThresholdBytes, DEFAULT_WS_COMPRESSION_THRESHOLD_BYTES);
assert.equal(defaults.outboundHighWaterBytes, DEFAULT_WS_OUTBOUND_HIGH_WATER_BYTES);
assert.equal(defaults.inputQueueHighWaterBytes, DEFAULT_WS_INPUT_QUEUE_HIGH_WATER_BYTES);
assert.notEqual(defaults.perMessageDeflate, false);

const disabled = resolveWebSocketTransportConfig({}, {
    WS_COMPRESSION: "off",
    WS_MAX_PAYLOAD_BYTES: "2048",
});
assert.equal(disabled.maxPayloadBytes, MIN_WS_MAX_PAYLOAD_BYTES);
assert.equal(disabled.compressionEnabled, false);
assert.equal(disabled.perMessageDeflate, false);

const bounded = resolveWebSocketTransportConfig({}, {
    WS_MAX_PAYLOAD_BYTES: String(MAX_WS_MAX_PAYLOAD_BYTES * 2),
    WS_COMPRESSION_THRESHOLD_BYTES: String(MAX_WS_MAX_PAYLOAD_BYTES * 2),
});
assert.equal(bounded.maxPayloadBytes, MAX_WS_MAX_PAYLOAD_BYTES);
assert.equal(bounded.compressionThresholdBytes, MAX_WS_MAX_PAYLOAD_BYTES);

const overridden = resolveWebSocketTransportConfig(
    {
        maxPayloadBytes: 2 * 1024 * 1024,
        compressionEnabled: false,
        outboundHighWaterBytes: 4 * 1024 * 1024,
        inputQueueHighWaterBytes: 3 * 1024 * 1024,
    },
    { WS_MAX_PAYLOAD_BYTES: "3000000", WS_COMPRESSION: "true" },
);
assert.equal(overridden.maxPayloadBytes, 2 * 1024 * 1024);
assert.equal(overridden.compressionEnabled, false);
assert.equal(overridden.outboundHighWaterBytes, 4 * 1024 * 1024);
assert.equal(overridden.inputQueueHighWaterBytes, 3 * 1024 * 1024);

console.log("websocket transport configuration regression test passed");
