import {
    readBooleanEnv,
    readPositiveEnvInteger,
    type EnvironmentSource,
} from "@server/config/environment";

export const DEFAULT_WS_MAX_PAYLOAD_BYTES = 1024 * 1024;
export const MIN_WS_MAX_PAYLOAD_BYTES = 64 * 1024;
export const MAX_WS_MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;
export const DEFAULT_WS_COMPRESSION_THRESHOLD_BYTES = 1024;
export const DEFAULT_WS_OUTBOUND_HIGH_WATER_BYTES = 8 * 1024 * 1024;
export const MIN_WS_OUTBOUND_HIGH_WATER_BYTES = 256 * 1024;
export const MAX_WS_OUTBOUND_HIGH_WATER_BYTES = 64 * 1024 * 1024;
export const DEFAULT_WS_INPUT_QUEUE_HIGH_WATER_BYTES = 2 * 1024 * 1024;
export const MIN_WS_INPUT_QUEUE_HIGH_WATER_BYTES = 64 * 1024;
export const MAX_WS_INPUT_QUEUE_HIGH_WATER_BYTES = 64 * 1024 * 1024;

export interface WebSocketTransportOverrides {
    readonly maxPayloadBytes?: number;
    readonly compressionEnabled?: boolean;
    readonly compressionThresholdBytes?: number;
    readonly outboundHighWaterBytes?: number;
    readonly inputQueueHighWaterBytes?: number;
}

export interface ResolvedWebSocketTransportConfig {
    readonly maxPayloadBytes: number;
    readonly compressionEnabled: boolean;
    readonly compressionThresholdBytes: number;
    readonly outboundHighWaterBytes: number;
    readonly inputQueueHighWaterBytes: number;
    readonly perMessageDeflate:
        | false
        | {
              readonly zlibDeflateOptions: { readonly level: number };
              readonly zlibInflateOptions: { readonly chunkSize: number };
              readonly threshold: number;
              readonly concurrencyLimit: number;
          };
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
    if (value === undefined || !Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(value)));
}

/** Resolves all WebSocket memory/CPU knobs in one testable place. */
export function resolveWebSocketTransportConfig(
    overrides: WebSocketTransportOverrides = {},
    environment: EnvironmentSource = process.env,
): ResolvedWebSocketTransportConfig {
    const maxPayloadBytes = boundedInteger(
        overrides.maxPayloadBytes ?? readPositiveEnvInteger("WS_MAX_PAYLOAD_BYTES", environment),
        DEFAULT_WS_MAX_PAYLOAD_BYTES,
        MIN_WS_MAX_PAYLOAD_BYTES,
        MAX_WS_MAX_PAYLOAD_BYTES,
    );
    const compressionEnabled =
        overrides.compressionEnabled ?? readBooleanEnv("WS_COMPRESSION", true, environment);
    const compressionThresholdBytes = boundedInteger(
        overrides.compressionThresholdBytes ??
            readPositiveEnvInteger("WS_COMPRESSION_THRESHOLD_BYTES", environment),
        DEFAULT_WS_COMPRESSION_THRESHOLD_BYTES,
        128,
        maxPayloadBytes,
    );
    const outboundHighWaterBytes = boundedInteger(
        overrides.outboundHighWaterBytes ??
            readPositiveEnvInteger("WS_OUTBOUND_HIGH_WATER_BYTES", environment),
        DEFAULT_WS_OUTBOUND_HIGH_WATER_BYTES,
        MIN_WS_OUTBOUND_HIGH_WATER_BYTES,
        MAX_WS_OUTBOUND_HIGH_WATER_BYTES,
    );
    const inputQueueHighWaterBytes = boundedInteger(
        overrides.inputQueueHighWaterBytes ??
            readPositiveEnvInteger("WS_INPUT_QUEUE_HIGH_WATER_BYTES", environment),
        DEFAULT_WS_INPUT_QUEUE_HIGH_WATER_BYTES,
        MIN_WS_INPUT_QUEUE_HIGH_WATER_BYTES,
        MAX_WS_INPUT_QUEUE_HIGH_WATER_BYTES,
    );

    return {
        maxPayloadBytes,
        compressionEnabled,
        compressionThresholdBytes,
        outboundHighWaterBytes,
        inputQueueHighWaterBytes,
        perMessageDeflate: compressionEnabled
            ? {
                  // Level 3 retains most game-packet savings without level 6's
                  // disproportionate CPU cost on a latency-sensitive tick loop.
                  zlibDeflateOptions: { level: 3 },
                  zlibInflateOptions: { chunkSize: 10 * 1024 },
                  threshold: compressionThresholdBytes,
                  concurrencyLimit: 4,
              }
            : false,
    };
}
