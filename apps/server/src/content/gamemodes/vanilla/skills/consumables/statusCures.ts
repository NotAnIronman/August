import { HEALTH_ORB_CURE_WIDGETS } from "@august/protocol/ui/healthOrb";
import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { secondsToTicks } from "@server/game/scripts/timing";
import { scheduleConsumableAction } from "./consumableActions";

export const STATUS_POTION_FAMILIES = [
    { name: "antipoison", ids: [2446,175,177,179], poisonSeconds: 90, venomSeconds: 0 },
    { name: "superantipoison", ids: [2448,181,183,185], poisonSeconds: 360, venomSeconds: 0 },
    { name: "antidote+", ids: [5943,5945,5947,5949], poisonSeconds: 540, venomSeconds: 0 },
    { name: "antidote++", ids: [5952,5954,5956,5958], poisonSeconds: 720, venomSeconds: 0 },
    { name: "anti-venom", ids: [12905,12907,12909,12911], poisonSeconds: 720, venomSeconds: 36 },
    { name: "anti-venom+", ids: [12913,12915,12917,12919], poisonSeconds: 900, venomSeconds: 216 },
    { name: "extended anti-venom+", ids: [29824,29827,29830,29833], poisonSeconds: 900, venomSeconds: 378 },
] as const;
type StatusPotionDose = {
    name: string;
    nextItemId: number;
    poisonSeconds: number;
    venomSeconds: number;
};
const potions = new Map<number, StatusPotionDose>(
    STATUS_POTION_FAMILIES.flatMap(family => family.ids.map((id, index) =>
        [id, { ...family, nextItemId: family.ids[index + 1] ?? 229 }] as const)),
);

export function drinkStatusPotion(
    player: PlayerState,
    slot: number,
    tick: number,
    services: ScriptServices,
): boolean {
    const itemId = player.items.getInventoryEntries()[slot]?.itemId;
    const def = potions.get(itemId);
    if (!def) return false;
    return scheduleConsumableAction({
        player, slotIndex: slot, itemId, tick, services,
        option: "drink", profile: "potion", loggerTag: "status-cure",
        onExecute: () => {
            services.inventory.setInventorySlot(player, slot, def.nextItemId, 1);
            if (def.venomSeconds > 0) {
                player.skillSystem.cureVenom();
                player.skillSystem.curePoison();
            } else {
                player.skillSystem.reduceVenomOrCurePoison(tick);
            }
            player.skillSystem.grantStatusImmunity(
                tick,
                secondsToTicks(services, def.poisonSeconds),
                secondsToTicks(services, def.venomSeconds),
            );
            services.animation.playPlayerSeq(player, 829);
            services.messaging.sendGameMessage(player, `You drink some of your ${def.name}.`);
        },
    });
}

export function cureFromHealthOrb(player: PlayerState, tick: number, services: ScriptServices): void {
    if (!player.status.venomEffect && !player.status.poisonEffect) return;
    const inventory = player.items.getInventoryEntries();
    // Prefer a full venom cure; otherwise one antipoison dose downgrades it.
    let slot = player.status.venomEffect
        ? inventory.findIndex(entry => entry.quantity > 0 && (potions.get(entry.itemId)?.venomSeconds ?? 0) > 0) : -1;
    if (slot < 0) slot = inventory.findIndex(entry => entry.quantity > 0 && potions.has(entry.itemId));
    if (slot < 0) {
        services.messaging.sendGameMessage(player, "You don't have an antipoison or anti-venom potion in your inventory.");
        return;
    }
    drinkStatusPotion(player, slot, tick, services);
}

export function registerStatusCures(registry: IScriptRegistry, services: ScriptServices): void {
    for (const id of potions.keys()) {
        registry.registerItemAction(id,
            ({ player, source, tick }) => { drinkStatusPotion(player, source.slot, tick, services); },
            "drink",
        );
    }
    for (const widgetId of HEALTH_ORB_CURE_WIDGETS) {
        registry.registerWidgetAction({
            widgetId, opId: 1,
            handler: ({ player, tick }) => cureFromHealthOrb(player, tick, services),
        });
    }
}
