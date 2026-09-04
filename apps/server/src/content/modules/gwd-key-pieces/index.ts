import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { isFrozenDoorComplete } from "@server/content/modules/frozen-door/progress";

const KEY_PIECES = new Map<number, readonly [number, number]>([
    [2215, [26360, 26361]], // Bandos
    [2205, [26364, 26365]], // Saradomin
    [3129, [26362, 26363]], // Zamorak
    [3162, [26358, 26359]], // Armadyl
]);

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    const unregister = services.combat.registerOnNpcKilled?.((player, npc) => {
        const variants = KEY_PIECES.get(npc.typeId);
        if (!variants || isFrozenDoorComplete(player) || variants.some((itemId) => player.items.hasItem(itemId))) return;
        const result = services.inventory.addItemToInventory(player, variants[0], 1);
        if (result.added > 0) {
            services.inventory.snapshotInventoryImmediate(player);
            services.messaging.sendGameMessage(player, "You receive a frozen key piece.");
        } else {
            services.groundItems.spawn(variants[0], 1, { x: player.tileX, y: player.tileY, level: player.level }, { ownerId: player.id, privateTicks: 100, worldViewId: player.worldViewId, isMonsterDrop: true });
            services.messaging.sendGameMessage(player, "Your frozen key piece falls to the ground.");
        }
    });
    if (unregister) registry.registerCleanup(unregister);
}
