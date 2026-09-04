import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ItemOnItemEvent, ItemOnLocEvent, ScriptServices } from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";
import { LockState } from "@server/game/model/LockState";
import { applyInventoryTransform } from "@server/game/skilling/InventoryTransform";

const ANCIENT_FORGE = 42966;
const TORVA_ANVIL = 28563;
const HAMMER = 2347;
const IMCANDO_HAMMER = 25644;
const BANDOS_CHESTPLATE = 11832;
const BANDOS_TASSETS = 11834;
const BANDOSIAN_COMPONENTS = 26394;
const NIHIL_SHARD = 26231;
const NIHIL_HORN = 26372;
const ARMADYL_CROSSBOW = 11785;
const ZARYTE_CROSSBOW = 26374;
const SMITHING_ANIMATION = 898;
const FLETCHING_ANIMATION = 1248;
const CRAFTING_LOCK_TICKS = 3;

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

function lockAndAnimate(player: PlayerState, services: ScriptServices, animation: number): void {
    const previousLock = player.lock;
    player.lock = LockState.FULL;
    services.animation.playPlayerSeq(player, animation);
    services.scheduler.after(CRAFTING_LOCK_TICKS, () => {
        if (player.lock === LockState.FULL) player.lock = previousLock;
    }, { kind: "player", id: player.id });
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
    const exchange = applyInventoryTransform(services.inventory, player, {
        inputs,
        outputs: [result],
        outputPlacement: "first-consumed-slot",
    });
    if (exchange.ok) {
        services.inventory.snapshotInventoryImmediate(player);
        return true;
    }
    if (exchange.reason === "inventory-full") {
        services.messaging.sendGameMessage(player, "You need more inventory space to do that.");
    } else if (exchange.reason === "mutation-failed") {
        services.inventory.snapshotInventoryImmediate(player);
        services.messaging.sendGameMessage(player, "Nothing happens.");
    }
    return false;
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

function repairTorva({ player, source, services }: ItemOnLocEvent): void {
    const damaged = source.itemId;
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
        lockAndAnimate(player, services, SMITHING_ANIMATION);
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
        lockAndAnimate(player, services, FLETCHING_ANIMATION);
        services.messaging.sendGameMessage(player, "You attach the nihil horn to the Armadyl crossbow.");
    }
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registry.registerItemOnLoc(BANDOS_CHESTPLATE, ANCIENT_FORGE, breakDownBandos);
    registry.registerItemOnLoc(BANDOS_TASSETS, ANCIENT_FORGE, breakDownBandos);
    for (const damaged of TORVA_REPAIRS.keys()) {
        registry.registerItemOnLoc(damaged, TORVA_ANVIL, repairTorva);
    }
    registry.registerItemOnItem(NIHIL_HORN, ARMADYL_CROSSBOW, createZaryteCrossbow);
    registry.registerItemOnItem(ARMADYL_CROSSBOW, NIHIL_HORN, createZaryteCrossbow);
}
