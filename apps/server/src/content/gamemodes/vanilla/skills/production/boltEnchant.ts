import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type { ScriptActionHandlerContext } from "@server/game/scripts/types";
import { applyInventoryTransform } from "@server/game/skilling/InventoryTransform";
import { defineSkillAction, repeatSkillAction } from "@server/game/skilling/SkillAction";
import { buildMessageEffect, buildSkillFailure } from "@server/content/gamemodes/vanilla/skills/production/productionActions";

const BOLT_ENCHANT_BOLTS_PER_SET = 10;
const BOLT_ENCHANT_DELAY_TICKS = 3;
const BOLT_ENCHANT_DEFAULT_ANIMATION = 4462;
const BOLT_ENCHANT_CYCLE_ACTION = defineSkillAction("bolt_enchant", {
    delayTicks: BOLT_ENCHANT_DELAY_TICKS,
});

interface SkillBoltEnchantActionData {
    sourceItemId: number;
    enchantedItemId: number;
    enchantedName: string;
    runeCosts: Array<{ runeId: number; quantity: number }>;
    xp: number;
    count: number;
    animationId?: number;
}

export function executeBoltEnchantAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, tick, services } = ctx;
    const data = ctx.data as SkillBoltEnchantActionData;
    const sourceItemId = data.sourceItemId;
    const enchantedItemId = data.enchantedItemId;
    const enchantedNameRaw = data.enchantedName.trim();
    const enchantedName = enchantedNameRaw.length > 0 ? enchantedNameRaw : "bolts";
    const requestedCount = Math.max(1, data.count);
    const animationId = data.animationId ?? BOLT_ENCHANT_DEFAULT_ANIMATION;
    const xpPerSet = Math.max(0, data.xp);

    if (!(sourceItemId > 0) || !(enchantedItemId > 0)) {
        return buildSkillFailure(
            player,
            "You can't enchant those bolts.",
            "bolt_enchant_invalid_items",
        );
    }

    const runeCostsRaw = Array.isArray(data.runeCosts) ? data.runeCosts : [];
    const runeCosts: Array<{ runeId: number; quantity: number }> = [];
    for (const entry of runeCostsRaw) {
        if (!(entry.runeId > 0) || !(entry.quantity > 0)) continue;
        runeCosts.push({ runeId: entry.runeId, quantity: entry.quantity });
    }

    const inventory = services.inventory.getInventoryItems(player);
    let sourceQuantity = 0;
    const runeInventory: Array<{ itemId: number; quantity: number }> = [];
    for (const entry of inventory) {
        if (!entry || entry.itemId <= 0 || entry.quantity <= 0) continue;
        if (entry.itemId === sourceItemId) sourceQuantity += entry.quantity;
        runeInventory.push({ itemId: entry.itemId, quantity: entry.quantity });
    }
    if (sourceQuantity < BOLT_ENCHANT_BOLTS_PER_SET) {
        return buildSkillFailure(
            player,
            "You don't have enough bolts to enchant.",
            "bolt_enchant_missing_bolts",
        );
    }

    const equipped = (services.equipment.getEquipArray(player) ?? []).filter((id) => id > 0);
    const runeValidation = services.combat.validateRunes(runeCosts, runeInventory, equipped) ?? {
        canCast: false,
    };
    if (!runeValidation.canCast) {
        return buildSkillFailure(
            player,
            "You do not have the runes to cast this spell.",
            "bolt_enchant_missing_runes",
        );
    }

    const consumedRunes = Array.isArray(runeValidation.runesConsumed)
        ? runeValidation.runesConsumed
        : [];

    const exchange = applyInventoryTransform(services.inventory, player, {
        inputs: [
            { itemId: sourceItemId, quantity: BOLT_ENCHANT_BOLTS_PER_SET },
            ...consumedRunes.map((entry) => ({
                itemId: entry.runeId,
                quantity: Math.max(1, entry.quantity),
            })),
        ],
        outputs: [{ itemId: enchantedItemId, quantity: BOLT_ENCHANT_BOLTS_PER_SET }],
    });
    if (!exchange.ok) {
        if (exchange.reason === "inventory-full") {
            return buildSkillFailure(
                player,
                "You don't have enough inventory space.",
                "bolt_enchant_inventory_full",
            );
        }
        const remainingBolts = services.inventory
            .getInventoryItems(player)
            .filter((entry) => entry.itemId === sourceItemId)
            .reduce((total, entry) => total + Math.max(0, entry.quantity), 0);
        const stillHasBolts = remainingBolts >= BOLT_ENCHANT_BOLTS_PER_SET;
        return buildSkillFailure(
            player,
            stillHasBolts
                ? "You do not have the runes to cast this spell."
                : "You don't have enough bolts to enchant.",
            stillHasBolts ? "bolt_enchant_missing_runes" : "bolt_enchant_missing_bolts",
        );
    }

    services.animation.playPlayerSeq(player, animationId);
    if (xpPerSet > 0) services.skills.addSkillXp(player, SkillId.Magic, xpPerSet);
    services.system.eventBus?.emit("item:craft", {
        playerId: player.id,
        itemId: enchantedItemId,
        count: BOLT_ENCHANT_BOLTS_PER_SET,
    });

    const effects: ActionEffect[] = [
        { type: "inventorySnapshot", playerId: player.id },
        buildMessageEffect(player, `You enchant ${BOLT_ENCHANT_BOLTS_PER_SET} ${enchantedName}.`),
    ];

    const remaining = Math.max(0, requestedCount - 1);
    if (remaining > 0) {
        const rescheduled = repeatSkillAction(
            services,
            player,
            BOLT_ENCHANT_CYCLE_ACTION,
            {
                sourceItemId,
                enchantedItemId,
                enchantedName,
                runeCosts,
                xp: xpPerSet,
                count: remaining,
                animationId,
            },
            tick,
        );
        if (!rescheduled) {
            effects.push(
                buildMessageEffect(player, "You stop enchanting because you're already busy."),
            );
        }
    }

    return {
        ok: true,
        cooldownTicks: BOLT_ENCHANT_DELAY_TICKS,
        groups: [...BOLT_ENCHANT_CYCLE_ACTION.groups],
        effects,
    };
}
