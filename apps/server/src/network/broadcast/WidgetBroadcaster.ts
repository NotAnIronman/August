import type { TickFrame } from "@server/game/tick/TickPhaseOrchestrator";
import type { WidgetAction } from "@server/widgets/WidgetManager";
import { logger } from "@server/observability/logger";
import { encodeMessage } from "@server/network/messages";
import type { BroadcastContext, BroadcastDomain } from "@server/network/broadcast/BroadcastDomain";

export interface WidgetBroadcasterServices {
    syncPostWidgetOpenState(playerId: number, action: WidgetAction): void;
}

function isClosePhaseWidgetAction(action: WidgetAction | undefined): boolean {
    return (
        action?.action === "close_sub" ||
        action?.action === "close" ||
        (action?.action === "set_hidden" && action.hidden === true && action.phase === "close")
    );
}

/**
 * Broadcasts widget open/close events to players.
 *
 * close events are sent BEFORE varps/varbits to prevent
 * re-render flicker. Non-close events are sent AFTER varps/varbits
 * so scripts have correct state when interfaces open.
 *
 * This broadcaster is called twice per tick:
 *   1. flushCloseEvents() - before VarBroadcaster
 *   2. flushOpenEvents() - after VarBroadcaster
 */
export class WidgetBroadcaster implements BroadcastDomain {
    constructor(private readonly services: WidgetBroadcasterServices) {}

    flush(_frame: TickFrame, _ctx: BroadcastContext): void {
        // Use flushCloseEvents() and flushOpenEvents() separately instead.
        // This method exists to satisfy the BroadcastDomain interface but
        // the split ordering is managed by the coordinator.
    }

    flushCloseEvents(frame: TickFrame, ctx: BroadcastContext): void {
        if (!frame.widgetEvents || frame.widgetEvents.length === 0) return;

        const closeEvents = frame.widgetEvents.filter((evt: { action?: WidgetAction }) =>
            isClosePhaseWidgetAction(evt.action),
        );
        for (const evt of closeEvents) {
            try {
                const sock = ctx.getSocketByPlayerId(evt.playerId);
                ctx.sendWithGuard(
                    sock,
                    encodeMessage({ type: "widget", payload: evt.action }),
                    "widget_close_event",
                );
            } catch (err) {
                // One bad widget event must not silently drop every other
                // queued event this tick (e.g. the level-up popup's icon
                // failing must never also take its text down with it).
                logger.error("[WidgetBroadcaster] failed to send close event:", evt.action, err);
            }
        }
    }

    flushOpenEvents(frame: TickFrame, ctx: BroadcastContext): void {
        if (!frame.widgetEvents || frame.widgetEvents.length === 0) return;

        const nonCloseEvents = frame.widgetEvents.filter(
            (evt: { action?: WidgetAction }) => !isClosePhaseWidgetAction(evt.action),
        );
        for (const evt of nonCloseEvents) {
            try {
                const sock = ctx.getSocketByPlayerId(evt.playerId);
                ctx.sendWithGuard(
                    sock,
                    encodeMessage({ type: "widget", payload: evt.action }),
                    "widget_event",
                );
                this.services.syncPostWidgetOpenState(evt.playerId, evt.action);
            } catch (err) {
                logger.error("[WidgetBroadcaster] failed to send widget event:", evt.action, err);
            }
        }
    }
}
