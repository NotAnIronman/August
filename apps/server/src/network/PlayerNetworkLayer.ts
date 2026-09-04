import { WebSocket } from "ws";

import type { PlayerState } from "@server/game/player";
import { logger } from "@server/observability/logger";

export interface PlayerSocketLookup {
    getSocketByPlayerId(playerId: number): WebSocket | undefined;
    forEach(fn: (player: PlayerState) => void): void;
}

export interface PlayerNetworkLayerOptions {
    /** Maximum bytes queued by ws plus the current tick batch for one client. */
    outboundHighWaterBytes?: number;
    now?: () => number;
}

type MessageBatch = { chunks: Uint8Array[]; totalBytes: number };

const DEFAULT_OUTBOUND_HIGH_WATER_BYTES = 8 * 1024 * 1024;
const BACKPRESSURE_WARNING_INTERVAL_MS = 5_000;

/**
 * Manages low-level message sending, batching, and direct-send guards.
 * Extracted from WSServer to isolate network transport concerns.
 */
export class PlayerNetworkLayer {
    private messageBatches = new Map<WebSocket, MessageBatch>();
    private enableMessageBatching = true;
    private isBroadcastPhase = false;
    private directSendBypassDepth = 0;
    private directSendWarningContexts = new Set<string>();
    private readonly backpressureWarningAt = new WeakMap<WebSocket, number>();
    private readonly outboundHighWaterBytes: number;
    private readonly now: () => number;

    constructor(options: PlayerNetworkLayerOptions = {}) {
        this.outboundHighWaterBytes = Math.max(
            64 * 1024,
            Math.trunc(options.outboundHighWaterBytes ?? DEFAULT_OUTBOUND_HIGH_WATER_BYTES),
        );
        this.now = options.now ?? Date.now;
    }

    private messageLength(message: string | Uint8Array): number {
        return typeof message === "string" ? Buffer.byteLength(message) : message.byteLength;
    }

    private rejectBackpressuredSocket(
        sock: WebSocket,
        context: string,
        additionalBytes: number,
    ): boolean {
        const pendingBytes = Math.max(0, Number(sock.bufferedAmount) || 0) + additionalBytes;
        if (pendingBytes <= this.outboundHighWaterBytes) return false;

        this.messageBatches.delete(sock);
        const now = this.now();
        const lastWarningAt = this.backpressureWarningAt.get(sock) ?? Number.NEGATIVE_INFINITY;
        if (now - lastWarningAt >= BACKPRESSURE_WARNING_INTERVAL_MS) {
            logger.warn(
                `[network] closing slow client; ${pendingBytes} outbound bytes exceeds ${this.outboundHighWaterBytes} (${context})`,
            );
            this.backpressureWarningAt.set(sock, now);
        }
        try {
            sock.close(1013, "outbound_backpressure");
        } catch {
            try {
                sock.terminate();
            } catch {
                // Socket may already be gone.
            }
        }
        return true;
    }

    setBroadcastPhase(active: boolean): void {
        this.isBroadcastPhase = active;
    }

    getIsBroadcastPhase(): boolean {
        return this.isBroadcastPhase;
    }

    withDirectSendBypass<T>(context: string, fn: () => T): T {
        this.directSendBypassDepth++;
        try {
            return fn();
        } finally {
            this.directSendBypassDepth = Math.max(0, this.directSendBypassDepth - 1);
        }
    }

    assertDirectSendAllowed(context: string): void {
        if (this.isBroadcastPhase || this.directSendBypassDepth > 0) return;
        if (this.directSendWarningContexts.has(context)) return;
        this.directSendWarningContexts.add(context);
        logger.warn(`[direct-send] ${context} invoked outside broadcast phase`);
    }

    sendWithGuard(
        sock: WebSocket | undefined,
        message: string | Uint8Array,
        context: string,
    ): void {
        if (!sock || sock.readyState !== WebSocket.OPEN) return;
        this.assertDirectSendAllowed(context);

        const messageBytes = this.messageLength(message);

        if (this.enableMessageBatching && this.isBroadcastPhase && message instanceof Uint8Array) {
            let batch = this.messageBatches.get(sock);
            if (!batch) {
                batch = { chunks: [], totalBytes: 0 };
                this.messageBatches.set(sock, batch);
            }
            if (this.rejectBackpressuredSocket(sock, context, batch.totalBytes + messageBytes)) {
                return;
            }
            batch.chunks.push(message);
            batch.totalBytes += messageBytes;
            return;
        }

        if (this.rejectBackpressuredSocket(sock, context, messageBytes)) return;

        try {
            sock.send(message);
        } catch (err) {
            logger.warn(`[direct-send] send failed (${context})`, err);
        }
    }

    flushMessageBatch(sock: WebSocket): void {
        const batch = this.messageBatches.get(sock);
        if (!batch || batch.chunks.length === 0) return;

        this.messageBatches.delete(sock);

        if (sock.readyState !== WebSocket.OPEN) return;
        if (this.rejectBackpressuredSocket(sock, "batch_flush", batch.totalBytes)) return;

        try {
            if (batch.chunks.length === 1) {
                sock.send(batch.chunks[0]);
            } else {
                const combined = new Uint8Array(batch.totalBytes);
                let offset = 0;
                for (const msg of batch.chunks) {
                    combined.set(msg, offset);
                    offset += msg.length;
                }
                sock.send(combined);
            }
        } catch (err) {
            logger.warn(`[batch-send] flush failed`, err);
        }
    }

    flushAllMessageBatches(): void {
        for (const sock of this.messageBatches.keys()) {
            this.flushMessageBatch(sock);
        }
        this.messageBatches.clear();
    }

    removeConnection(sock: WebSocket): void {
        this.messageBatches.delete(sock);
        this.backpressureWarningAt.delete(sock);
    }

    flushDirectSendWarnings(stage: string): void {
        if (this.directSendWarningContexts.size === 0) return;
        const contexts = Array.from(this.directSendWarningContexts);
        this.directSendWarningContexts.clear();
        const summary = `[direct-send] contexts outside broadcast phase during ${stage}: ${contexts.join(
            ", ",
        )}`;
        const strictEnv = process.env.DIRECT_SEND_GUARD_STRICT;
        const shouldThrow =
            strictEnv === "1" ||
            (strictEnv !== "0" && (process.env.NODE_ENV ?? "development") !== "production");
        if (shouldThrow) {
            throw new Error(summary);
        }
        logger.error(summary);
    }

    sendAdminResponse(ws: WebSocket, message: string | Uint8Array, context: string): void {
        this.withDirectSendBypass(context, () => this.sendWithGuard(ws, message, context));
    }
}
