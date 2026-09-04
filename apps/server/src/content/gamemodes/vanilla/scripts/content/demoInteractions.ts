import { type IScriptRegistry, type ScriptServices } from "@server/game/scripts/types";
import { logger } from "@server/observability/logger";

export function registerDemoInteractionHandlers(
    registry: IScriptRegistry,
    _services: ScriptServices,
): void {
    if (process.env.ENABLE_DEMO_SCRIPTS !== "1") return;

    registry.registerNpcScript({
        npcId: 0,
        option: undefined,
        handler: ({ tick, player, npc, option }) => {
            logger.debug(
                `[demo-script] tick=${tick} player=${player.id} interacted with npc=${
                    npc.id
                } option=${option ?? "default"}`,
            );
        },
    });

    registry.registerLocScript({
        locId: 0,
        action: undefined,
        handler: ({ tick, player, locId, action, tile }) => {
            logger.debug(
                `[demo-script] tick=${tick} player=${
                    player.id
                } interacted with loc=${locId} action=${action ?? "default"} at (${tile.x},${
                    tile.y
                })`,
            );
        },
    });
}
