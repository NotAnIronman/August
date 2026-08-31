import type { ScriptServices, WidgetOpenHandler } from "@server/game/scripts/types";

const MUSIC_GROUP_ID = 239;

export function registerWidgetOpenHandlers(services: ScriptServices): void {
    const handlers = services.widgetOpenHandlers ?? new Map<number, WidgetOpenHandler>();

    handlers.set(MUSIC_GROUP_ID, (player) => {
        services.sound.syncMusicInterface?.(player);
    });

    services.widgetOpenHandlers = handlers;
}
