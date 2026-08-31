import type { WebSocket } from "ws";

import type { TickFrame } from "@server/game/tick/TickPhaseOrchestrator";
import { logger } from "@server/observability/logger";
import { encodeMessage } from "@server/network/messages";
import type { BroadcastContext, BroadcastDomain } from "@server/network/broadcast/BroadcastDomain";

/**
 * Broadcasts chat messages to players.
 *
 * In binary player sync mode, player public chat is carried by the
 * PublicChat update block instead of the standalone `chat` message.
 */
export class ChatBroadcaster implements BroadcastDomain {
    private forEachPlayer: ((fn: (sock: WebSocket, playerId?: number) => void) => void) | undefined;

    constructor(forEachPlayer?: (fn: (sock: WebSocket) => void) => void) {
        this.forEachPlayer = forEachPlayer;
    }

    setForEachPlayer(fn: (callback: (sock: WebSocket) => void) => void): void {
        this.forEachPlayer = fn;
    }

    flush(frame: TickFrame, ctx: BroadcastContext): void {
        if (!frame.chatMessages || frame.chatMessages.length === 0) return;

        for (const msg of frame.chatMessages) {
            // In binary player sync mode, player public chat is carried by the
            // PublicChat update block instead of the standalone `chat` message.
            if (msg.messageType === "public" && msg.playerId !== undefined) {
                continue;
            }

            let encoded: ReturnType<typeof encodeMessage>;
            try {
                encoded = encodeMessage({
                    type: "chat",
                    payload: {
                        messageType: msg.messageType === "private" ? "private_in" : msg.messageType,
                        playerId: msg.playerId,
                        from: msg.from,
                        prefix: msg.prefix,
                        text: msg.text,
                        chatType: msg.chatType,
                    },
                });
            } catch (err) {
                // A message that fails to encode (e.g. text too long for the chat
                // packet's byte-length prefix) can NEVER succeed on retry. If this
                // throw is allowed to propagate, the whole broadcast phase aborts
                // and the entire frame — every broadcaster, not just chat — gets
                // restored and retried next tick, forever, since the failure is
                // permanent. That wedges the tick loop and tanks the tickrate.
                // Drop just this one message and keep going instead.
                logger.warn(
                    `[chat] Dropping unsendable chat message (messageType=${msg.messageType}, ` +
                        `textLen=${msg.text?.length ?? 0}): ${err instanceof Error ? err.message : err}`,
                );
                continue;
            }

            if (msg.targetPlayerIds && msg.targetPlayerIds.length > 0) {
                for (const targetId of msg.targetPlayerIds) {
                    ctx.sendWithGuard(ctx.getSocketByPlayerId(targetId), encoded, "chat_direct");
                }
            } else if (this.forEachPlayer) {
                this.forEachPlayer((sock) => ctx.sendWithGuard(sock, encoded, "chat_broadcast"));
            }
        }
    }
}
