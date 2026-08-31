import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

const KEY_PIECES = new Map<number, readonly [number, number]>([
    [2215, [26360, 26361]], // Bandos
    [2205, [26364, 26365]], // Saradomin
    [3129, [26362, 26363]], // Zamorak
    [3162, [26358, 26359]], // Armadyl
]);

export function register(_registry: IScriptRegistry, services: ScriptServices): void {
    services.combat.registerOnNpcKilled?.((player, npc) => {
        const variants = KEY_PIECES.get(npc.typeId);
        if (!variants || variants.some((itemId) => player.items.hasItem(itemId))) return;
        const result = services.inventory.addItemToInventory(player, variants[0], 1);
        if (result.added > 0) {
            services.inventory.snapshotInventoryImmediate(player);
            services.messaging.sendGameMessage(player, "You receive a frozen key piece.");
        }
    });
}
