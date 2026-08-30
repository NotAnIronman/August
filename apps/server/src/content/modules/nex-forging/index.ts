import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ItemOnItemEvent, ItemOnLocEvent, ScriptServices } from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";

const ANCIENT_FORGE = 42966;
const HAMMER = 2347;
const IMCANDO_HAMMER = 25644;
const BANDOS_CHESTPLATE = 11832;
const BANDOS_TASSETS = 11834;
const BANDOSIAN_COMPONENTS = 26394;
const NIHIL_SHARD = 26231;
const NIHIL_HORN = 26372;
const ARMADYL_CROSSBOW = 11785;
const ZARYTE_CROSSBOW = 26374;

const TORVA_REPAIRS = new Map<number, { components: number; result: number }>([
    [26376, { components: 1, result: 26382 }],
    [26380, { components: 2, result: 26386 }],
    [26378, { components: 3, result: 26384 }],
]);

function hasSmithingHammer(player: PlayerState): boolean {
    return player.items.hasItem(HAMMER)
        || player.items.hasItem(IMCANDO_HAMMER)
        || player.appearance.equip.includes(IMCANDO_HAMMER);
}

function restoreInventory(player: PlayerState, snapshot: readonly { itemId: number; quantity: number }[]): void {
    snapshot.forEach((entry, slot) => player.items.setInventorySlot(slot, entry.itemId, entry.quantity));
}

/**
 * Removes all inputs and awards the output synchronously.  On any failure the
 * exact inventory snapshot is restored, so a disconnect cannot consume items
 * without producing the corresponding result.
 */
function transact(
    player: PlayerState,
    services: ScriptServices,
    inputs: readonly { itemId: number; quantity: number }[],
    result: { itemId: number; quantity: number },
): boolean {
    const snapshot = player.items.getInventoryEntries().map((entry) => ({ ...entry }));
    try {
        for (const input of inputs) {
            if (player.items.removeItem(input.itemId, input.quantity, { assureFullRemoval: true }).completed !== input.quantity) {
                restoreInventory(player, snapshot);
                return false;
            }
        }
        if (player.items.addItem(result.itemId, result.quantity, { assureFullInsertion: true }).completed !== result.quantity) {
            restoreInventory(player, snapshot);
            services.messaging.sendGameMessage(player, "You need more inventory space to do that.");
            return false;
        }
        services.inventory.snapshotInventoryImmediate(player);
        return true;
    } catch {
        restoreInventory(player, snapshot);
        services.inventory.snapshotInventoryImmediate(player);
        services.messaging.sendGameMessage(player, "Nothing happens.");
        return false;
    }
}

function breakDownBandos({ player, source, services }: ItemOnLocEvent): void {
    if (!hasSmithingHammer(player)) {
        services.messaging.sendGameMessage(player, "You need a hammer to break this down.");
        return;
    }
    const components = source.itemId === BANDOS_CHESTPLATE ? 3 : 2;
    if (transact(player, services, [{ itemId: source.itemId, quantity: 1 }], { itemId: BANDOSIAN_COMPONENTS, quantity: components })) {
        services.messaging.sendGameMessage(player, "You break the armour down into Bandosian components.");
    }
}

function repairTorva(event: ItemOnItemEvent): void {
    const { player, source, target, services } = event;
    const damaged = TORVA_REPAIRS.get(source.itemId) ? source.itemId : target.itemId;
    const recipe = TORVA_REPAIRS.get(damaged);
    if (!recipe) return;
    if (!player.items.hasItem(BANDOSIAN_COMPONENTS, recipe.components)) return;
    const smithing = player.skillSystem.getSkill(SkillId.Smithing);
    if (smithing.baseLevel + smithing.boost < 90) {
        services.messaging.sendGameMessage(player, "You need a Smithing level of 90 to repair this armour.");
        return;
    }
    if (!hasSmithingHammer(player)) {
        services.messaging.sendGameMessage(player, "You need a hammer to repair this armour.");
        return;
    }
    if (transact(player, services, [
        { itemId: damaged, quantity: 1 },
        { itemId: BANDOSIAN_COMPONENTS, quantity: recipe.components },
    ], { itemId: recipe.result, quantity: 1 })) {
        services.messaging.sendGameMessage(player, "You repair the Torva armour.");
    }
}

function createZaryteCrossbow({ player, services }: ItemOnItemEvent): void {
    if (!player.items.hasItem(NIHIL_SHARD, 250)) {
        services.messaging.sendGameMessage(player, "You need 250 nihil shards to create a Zaryte crossbow.");
        return;
    }
    if (transact(player, services, [
        { itemId: NIHIL_HORN, quantity: 1 },
        { itemId: ARMADYL_CROSSBOW, quantity: 1 },
        { itemId: NIHIL_SHARD, quantity: 250 },
    ], { itemId: ZARYTE_CROSSBOW, quantity: 1 })) {
        services.messaging.sendGameMessage(player, "You attach the nihil horn to the Armadyl crossbow.");
    }
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registry.registerItemOnLoc(BANDOS_CHESTPLATE, ANCIENT_FORGE, breakDownBandos);
    registry.registerItemOnLoc(BANDOS_TASSETS, ANCIENT_FORGE, breakDownBandos);
    for (const damaged of TORVA_REPAIRS.keys()) {
        registry.registerItemOnItem(BANDOSIAN_COMPONENTS, damaged, repairTorva);
        registry.registerItemOnItem(damaged, BANDOSIAN_COMPONENTS, repairTorva);
    }
    registry.registerItemOnItem(NIHIL_HORN, ARMADYL_CROSSBOW, createZaryteCrossbow);
    registry.registerItemOnItem(ARMADYL_CROSSBOW, NIHIL_HORN, createZaryteCrossbow);
}
