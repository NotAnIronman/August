import { WebSocket } from "ws";
import type { RawData } from "ws";

import { logger } from "@server/observability/logger";
import type { ServerServices } from "@server/game/ServerServices";

export type RawMessageHandler = (raw: RawData) => void;

/**
 * Maximum client messages queued per connection per tick. Messages arriving
 * beyond the cap are dropped until the queue drains.
 */
const MAX_QUEUED_MESSAGES_PER_TICK = 30;
export const DEFAULT_MAX_QUEUED_INPUT_BYTES_PER_TICK = 2 * 1024 * 1024;
const DROP_WARNING_INTERVAL_MS = 5_000;

type DroppedMessageState = { dropped: number; droppedBytes: number; lastWarningAt: number };

function rawDataByteLength(raw: RawData): number {
    if (Array.isArray(raw)) {
        return raw.reduce((total, chunk) => total + chunk.byteLength, 0);
    }
    return raw.byteLength;
}

/**
 * Per-connection FIFO of raw client messages, drained at a fixed point at the
 * start of each game tick. Socket reads only enqueue; game state is never
 * mutated mid-tick by packet arrival, so packet handling is deterministic with
 * respect to the tick phases.
 */
export class ClientInputService {
    private readonly handlers = new Map<WebSocket, RawMessageHandler>();
    private readonly queues = new Map<WebSocket, RawData[]>();
    private readonly queuedBytes = new Map<WebSocket, number>();
    private readonly droppedMessages = new WeakMap<WebSocket, DroppedMessageState>();
    private draining = false;

    constructor(
        private readonly svc: ServerServices,
        private readonly now: () => number = Date.now,
        private readonly maxQueuedBytesPerTick: number =
            DEFAULT_MAX_QUEUED_INPUT_BYTES_PER_TICK,
    ) {
        this.maxQueuedBytesPerTick = Number.isFinite(maxQueuedBytesPerTick)
            ? Math.max(1, Math.trunc(maxQueuedBytesPerTick))
            : DEFAULT_MAX_QUEUED_INPUT_BYTES_PER_TICK;
    }

    registerConnection(ws: WebSocket, handler: RawMessageHandler): void {
        this.handlers.set(ws, handler);
    }

    /**
     * True while drain() is executing queued messages, i.e. the current call
     * stack is inside the client_input tick phase. Drain is fully synchronous,
     * so handlers can use this to tell tick-time processing apart from
     * arrival-time processing.
     */
    isDraining(): boolean {
        return this.draining;
    }

    hasQueued(ws: WebSocket): boolean {
        return this.queues.has(ws);
    }

    enqueue(ws: WebSocket, raw: RawData): void {
        let queue = this.queues.get(ws);
        if (!queue) {
            queue = [];
            this.queues.set(ws, queue);
        }
        const messageBytes = rawDataByteLength(raw);
        const currentBytes = this.queuedBytes.get(ws) ?? 0;
        if (
            queue.length >= MAX_QUEUED_MESSAGES_PER_TICK ||
            messageBytes > this.maxQueuedBytesPerTick - currentBytes
        ) {
            const now = this.now();
            const state = this.droppedMessages.get(ws) ?? {
                dropped: 0,
                droppedBytes: 0,
                lastWarningAt: Number.NEGATIVE_INFINITY,
            };
            state.dropped++;
            state.droppedBytes += messageBytes;
            if (now - state.lastWarningAt >= DROP_WARNING_INTERVAL_MS) {
                logger.warn(
                    `[client_input] queue limit reached (${queue.length} messages, ${currentBytes} bytes) for player ${
                        this.svc.players?.get(ws)?.id ?? "?"
                    }; dropped ${state.dropped} message(s) / ${state.droppedBytes} byte(s)`,
                );
                state.dropped = 0;
                state.droppedBytes = 0;
                state.lastWarningAt = now;
            }
            this.droppedMessages.set(ws, state);
            return;
        }
        queue.push(raw);
        this.queuedBytes.set(ws, currentBytes + messageBytes);
    }

    drain(): void {
        if (this.queues.size === 0) return;
        this.draining = true;
        try {
            const entries = Array.from(this.queues.entries());
            this.queues.clear();
            this.queuedBytes.clear();
            // World-entry (pre-login) queues first in arrival order, then
            // players in id order, matching the engine cycle of login
            // registration followed by per-player message handling.
            const playerIds = new Map<WebSocket, number | undefined>();
            for (const [ws] of entries) {
                playerIds.set(ws, this.svc.players?.get(ws)?.id);
            }
            entries.sort((a, b) => {
                const pa = playerIds.get(a[0]);
                const pb = playerIds.get(b[0]);
                if (pa === undefined) return pb === undefined ? 0 : -1;
                if (pb === undefined) return 1;
                return pa - pb;
            });
            for (const [ws, queue] of entries) {
                if (ws.readyState !== WebSocket.OPEN) continue;
                const handler = this.handlers.get(ws);
                if (!handler) continue;
                for (const raw of queue) {
                    try {
                        handler(raw);
                    } catch (err) {
                        logger.error("[client_input] message handler threw", err);
                    }
                }
            }
        } finally {
            this.draining = false;
        }
    }

    removeConnection(ws: WebSocket): void {
        this.handlers.delete(ws);
        this.queues.delete(ws);
        this.queuedBytes.delete(ws);
        this.droppedMessages.delete(ws);
    }
}
