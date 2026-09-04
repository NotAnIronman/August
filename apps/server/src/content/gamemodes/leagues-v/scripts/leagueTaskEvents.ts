import type { GameEventBus } from "@server/game/events/GameEventBus";
import { registerEventSubscription } from "@server/game/scripts/ScriptLifecycle";
import type { IScriptRegistry } from "@server/game/scripts/types";

/**
 * The event surface needed by the Leagues task tracker. Keeping this narrower
 * than LeagueTaskManager makes the wiring reusable and straightforward to test.
 */
export interface LeagueTaskEventSink {
    onNpcKill(playerId: number, npcTypeId: number, combatLevel?: number): void;
    onItemEquip(playerId: number, itemId: number): void;
    onItemCraft(playerId: number, itemId: number, count: number): void;
}

/**
 * Bind task progress events to the current script provider. Subscriptions are
 * replaced on hot reload and removed on registration rollback/runtime reset.
 */
export function registerLeagueTaskEventHandlers(
    registry: IScriptRegistry,
    eventBus: GameEventBus,
    getSink: () => LeagueTaskEventSink | undefined,
): void {
    registerEventSubscription(
        registry,
        eventBus.on("npc:death", ({ killerPlayerId, npcTypeId, combatLevel }) => {
            if (killerPlayerId !== undefined) {
                getSink()?.onNpcKill(killerPlayerId, npcTypeId, combatLevel);
            }
        }),
    );
    registerEventSubscription(
        registry,
        eventBus.on("equipment:equip", ({ player, itemId }) => {
            getSink()?.onItemEquip(player.id, itemId);
        }),
    );
    registerEventSubscription(
        registry,
        eventBus.on("item:craft", ({ playerId, itemId, count }) => {
            getSink()?.onItemCraft(playerId, itemId, count);
        }),
    );
}
