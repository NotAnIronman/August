import { logger } from "@server/observability/logger";
import type { MessageHandlerServices } from "@server/network/MessageHandlers";
import type { MessageRouter } from "@server/network/MessageRouter";

export function registerSpellHandlers(
    router: MessageRouter,
    services: MessageHandlerServices,
): void {
    router.register("spell_cast_npc", (ctx) => {
        try {
            if (ctx.player) {
                services.handleSpellCast(
                    ctx.ws,
                    ctx.player,
                    ctx.payload,
                    "npc",
                    services.currentTick(),
                );
            }
        } catch (err) {
            logger.warn("[combat] spell_cast_npc dispatch failed", err);
        }
    });

    router.register("spell_cast_player", (ctx) => {
        try {
            // Avoid eager JSON serialization and info-level I/O on every cast.
            // The structured payload is formatted only when debug logging is enabled.
            logger.debug("[combat] received spell_cast_player", ctx.payload);
            if (ctx.player) {
                services.handleSpellCast(
                    ctx.ws,
                    ctx.player,
                    ctx.payload,
                    "player",
                    services.currentTick(),
                );
            }
        } catch (err) {
            logger.warn("[combat] spell_cast_player dispatch failed", err);
        }
    });

    router.register("spell_cast_loc", (ctx) => {
        try {
            if (ctx.player) {
                services.handleSpellCast(
                    ctx.ws,
                    ctx.player,
                    ctx.payload,
                    "loc",
                    services.currentTick(),
                );
            }
        } catch (err) {
            logger.warn("[combat] spell_cast_loc dispatch failed", err);
        }
    });

    router.register("spell_cast_obj", (ctx) => {
        try {
            if (ctx.player) {
                services.handleSpellCast(
                    ctx.ws,
                    ctx.player,
                    ctx.payload,
                    "obj",
                    services.currentTick(),
                );
            }
        } catch (err) {
            logger.warn("[combat] spell_cast_obj dispatch failed", err);
        }
    });

    router.register("spell_cast_item", (ctx) => {
        try {
            services.handleSpellCastOnItem(ctx.ws, ctx.payload);
        } catch (err) {
            logger.warn("[magic] spell_cast_item dispatch failed", err);
        }
    });
}
