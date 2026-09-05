import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";

export const DRAKANS_MEDALLION_ID = 22400;
export const DRAKANS_DESTINATIONS = [
    { option: "Ver Sinhaza", x: 3649, y: 3230, level: 0 },
    { option: "Slepe", x: 3808, y: 9754, level: 1 },
    { option: "Darkmeyer", x: 3605, y: 3362, level: 0 },
] as const;

function teleport(player: PlayerState, services: ScriptServices, destination: typeof DRAKANS_DESTINATIONS[number]): void {
    const result = services.movement.requestTeleportAction(player, {
        x: destination.x, y: destination.y, level: destination.level,
        requireCanTeleport: true, rejectIfPending: true, replacePending: false,
        resetAnimation: true,
        arriveMessage: `You arrive at ${destination.option}.`,
    });
    if (!result.ok) services.messaging.sendGameMessage(player,
        result.reason === "cannot_teleport" ? "A magical force stops you from teleporting." : "You can't teleport right now.");
}

export function registerDrakansMedallionHandlers(registry: IScriptRegistry): void {
    for (const destination of DRAKANS_DESTINATIONS) {
        registry.registerItemAction(DRAKANS_MEDALLION_ID, ({ player, source, services }) => {
            const item = services.inventory.getInventoryItems(player)[source.slot];
            if (source.itemId !== DRAKANS_MEDALLION_ID || item?.itemId !== DRAKANS_MEDALLION_ID || item.quantity <= 0) return;
            teleport(player, services, destination);
        }, destination.option);
        registry.registerEquipmentAction(DRAKANS_MEDALLION_ID, ({ player, slot, itemId, services }) => {
            if (itemId !== DRAKANS_MEDALLION_ID || services.equipment.getEquippedItem(player,slot) !== DRAKANS_MEDALLION_ID) return;
            teleport(player, services, destination);
        }, destination.option);
    }
}
