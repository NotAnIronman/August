import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import {
    ANY_LOC_ID,
    type IScriptRegistry,
    type ScriptActionHandlerContext,
    type ScriptServices,
} from "@server/game/scripts/types";
import {
    MAX_BATCH,
    buildMessageEffect,
    buildSkillFailure,
    clampBatchCount,
    enqueueSkillAction,
    getInventory,
} from "@server/content/gamemodes/vanilla/skills/production/productionActions";
import {
    consumeRingOfForgingCharge,
    getRingOfForgingCharges,
    getSmeltingXpWithBonuses,
    shouldGuaranteeIronSmelt,
} from "@server/content/gamemodes/vanilla/skills/smithing/smithingBonuses";
import {
    SMELTING_RECIPES,
    type SmeltingRecipe,
    calculateIronSmeltChance,
    computeSmeltingBatchCount,
    getSmeltingRecipeById,
    hasRequiredSmeltingTools,
} from "@server/content/gamemodes/vanilla/skills/smithing/smithingData";

const FURNACE_ANIMATION = 899;

interface SkillSmeltActionData {
    recipeId: string;
    count: number;
    facilityLocId?: number;
}

function getEffectiveSmithingLevel(player: PlayerState): number {
    const skill = player.skillSystem.getSkill(SkillId.Smithing);
    return Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0));
}

function buildSmeltInterfaceFailure(
    player: PlayerState,
    message: string,
    reason: string,
    services: ScriptServices,
): ActionExecutionResult {
    const result = buildSkillFailure(player, message, reason);
    services.production?.updateSmeltingInterface?.(player);
    return result;
}

function firstRemovedSlot(
    removed: Map<number, { itemId: number; quantity: number }>,
): number | undefined {
    for (const [slot] of removed) return slot;
    return undefined;
}

function describeBar(services: ScriptServices, itemId: number): string {
    return services.data.getObjType(itemId)?.name ?? "bar";
}

function rollSmeltingSuccess(
    level: number,
    recipe: SmeltingRecipe,
    equip: number[],
    ringCharges?: number,
): boolean {
    if (shouldGuaranteeIronSmelt(recipe, equip, ringCharges)) return true;
    if (recipe.successType === "iron") {
        const chance = calculateIronSmeltChance(level);
        return Math.random() < chance;
    }
    return true;
}

export function executeSmeltAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, tick, services } = ctx;
    const data = ctx.data as SkillSmeltActionData;
    const recipe = getSmeltingRecipeById(data.recipeId);
    if (!recipe) {
        return buildSmeltInterfaceFailure(
            player,
            "You can't smelt that bar.",
            "unknown_recipe",
            services,
        );
    }

    const skill = services.skills.getSkill(player, SkillId.Smithing);
    if (getEffectiveSmithingLevel(player) < recipe.level) {
        return buildSmeltInterfaceFailure(
            player,
            `You need Smithing level ${recipe.level} to smelt that.`,
            "smelt_level",
            services,
        );
    }

    if (
        recipe.allowedLocIds &&
        !recipe.allowedLocIds.includes(data.facilityLocId ?? -1)
    ) {
        return buildSmeltInterfaceFailure(
            player,
            "This furnace is not hot enough to smelt that.",
            "wrong_facility",
            services,
        );
    }

    const inventory = getInventory(services, player);
    if (!hasRequiredSmeltingTools(inventory, recipe)) {
        return buildSmeltInterfaceFailure(
            player,
            "You need the right mould to make that.",
            "missing_tool",
            services,
        );
    }

    const removal = services.production?.takeInventoryItems(
        player,
        recipe.inputs as Array<{ itemId: number; quantity: number }>,
    );
    if (!removal?.ok) {
        return buildSmeltInterfaceFailure(
            player,
            "You need the right ores to smelt that.",
            "missing_ore",
            services,
        );
    }

    const targetCount = Math.max(1, data.count);
    const delay = recipe.delayTicks !== undefined ? Math.max(1, recipe.delayTicks) : 4;
    const effects: ActionEffect[] = [];

    const equip = services.equipment.getEquipArray(player) ?? [];
    const ringCharges = recipe.successType === "iron" ? getRingOfForgingCharges(player) : undefined;
    const success = rollSmeltingSuccess(skill?.baseLevel ?? 1, recipe, equip, ringCharges);

    if (success) {
        const fSlot = firstRemovedSlot(removal.removed);
        if (fSlot !== undefined) {
            services.inventory.setInventorySlot(
                player,
                fSlot,
                recipe.outputItemId,
                Math.max(1, recipe.outputQuantity),
            );
        } else {
            const dest = services.inventory.addItemToInventory(
                player,
                recipe.outputItemId,
                Math.max(1, recipe.outputQuantity),
            );
            if (dest.added <= 0) {
                services.production?.restoreInventoryRemovals(player, removal.removed);
                return buildSmeltInterfaceFailure(
                    player,
                    "You need more inventory space for the bar.",
                    "inventory_full",
                    services,
                );
            }
        }

        services.animation.playPlayerSeq(player, recipe.animation ?? FURNACE_ANIMATION);
        const xpAward = getSmeltingXpWithBonuses(recipe, equip);
        services.skills.addSkillXp(player, SkillId.Smithing, xpAward);
        services.system.eventBus?.emit("item:craft", {
            playerId: player.id,
            itemId: recipe.outputItemId,
            count: Math.max(1, recipe.outputQuantity),
        });
        const barName = describeBar(services, recipe.outputItemId);
        effects.push(
            { type: "inventorySnapshot", playerId: player.id },
            buildMessageEffect(player, `You retrieve a ${barName.toLowerCase()}.`),
        );
        if (recipe.successType === "iron") {
            consumeRingOfForgingCharge(player, services);
        }
    } else {
        effects.push(
            buildMessageEffect(player, "The iron ore is too impure and you fail to produce a bar."),
        );
    }

    const remaining = Math.max(0, targetCount - 1);
    if (remaining > 0) {
        const reschedule = services.combat.scheduleAction(
            player.id,
            {
                kind: "skill.smelt",
                data: { recipeId: recipe.id, count: remaining },
                delayTicks: delay,
                cooldownTicks: delay,
                groups: ["skill.smelt"],
            },
            tick,
        );
        if (!reschedule?.ok) {
            effects.push(buildMessageEffect(player, "You stop smelting."));
        }
    }

    services.production?.updateSmeltingInterface?.(player);
    return { ok: true, cooldownTicks: delay, groups: ["skill.smelt"], effects };
}

type SmeltChoice = {
    recipe: SmeltingRecipe;
    batch: number;
};

export function registerSmeltingInteractions(registry: IScriptRegistry, services: ScriptServices) {
    const requestAction = services.combat.requestAction;

    const trySmeltRecipe = (
        player: PlayerState,
        recipe: SmeltingRecipe,
        tick?: number,
        opts?: { desiredCount?: number; facilityLocId?: number },
    ) => {
        const smithLevel = getEffectiveSmithingLevel(player);
        if (smithLevel < recipe.level) {
            services.messaging.sendGameMessage(
                player,
                `You need Smithing level ${recipe.level} to smelt that.`,
            );
            return;
        }
        const inventoryNow = getInventory(services, player);
        const batch = clampBatchCount(computeSmeltingBatchCount(inventoryNow, recipe));
        if (batch <= 0) {
            services.messaging.sendGameMessage(
                player,
                "You need the proper ores to smelt that bar.",
            );
            return;
        }
        if (!hasRequiredSmeltingTools(inventoryNow, recipe)) {
            services.messaging.sendGameMessage(player, "You need the right mould to make that.");
            return;
        }
        if (recipe.allowedLocIds && !recipe.allowedLocIds.includes(opts?.facilityLocId ?? -1)) {
            services.messaging.sendGameMessage(player, "This furnace is not hot enough to smelt that.");
            return;
        }
        const desired = Math.max(1, Math.min(batch, opts?.desiredCount ?? batch));
        enqueueSkillAction(
            requestAction,
            "smelt",
            player,
            recipe.id,
            desired,
            recipe.delayTicks ?? 4,
            tick,
            services.messaging.sendGameMessage,
            { facilityLocId: opts?.facilityLocId },
        );
    };

    const openSmeltDialog = (
        player: PlayerState,
        tick: number,
        preferredRecipeId?: string,
        facilityLocId?: number,
    ) => {
        const smithLevel = getEffectiveSmithingLevel(player);
        const inventory = getInventory(services, player);

        const withMaterials = SMELTING_RECIPES.map((recipe) => {
            const available = clampBatchCount(computeSmeltingBatchCount(inventory, recipe));
            return { recipe, available };
        }).filter((entry) =>
            entry.available > 0 &&
            hasRequiredSmeltingTools(inventory, entry.recipe) &&
            (!entry.recipe.allowedLocIds || entry.recipe.allowedLocIds.includes(facilityLocId ?? -1)),
        );

        if (withMaterials.length === 0) {
            services.messaging.sendGameMessage(player, "You need ores to smelt any bars.");
            return;
        }

        const craftableChoices: SmeltChoice[] = withMaterials
            .filter((entry) => smithLevel >= entry.recipe.level)
            .map((entry) => ({
                recipe: entry.recipe,
                batch: Math.max(1, Math.min(MAX_BATCH, entry.available)),
            }));

        if (craftableChoices.length === 0) {
            const lowest = withMaterials.reduce((prev, curr) =>
                curr.recipe.level < prev.recipe.level ? curr : prev,
            );
            services.messaging.sendGameMessage(
                player,
                `You need Smithing level ${lowest.recipe.level} to smelt ${lowest.recipe.name}.`,
            );
            return;
        }

        let products = craftableChoices;
        if (preferredRecipeId) {
            const preferred = craftableChoices.find((c) => c.recipe.id === preferredRecipeId);
            if (preferred) {
                products = [preferred];
            }
        }

        const maxQuantity = Math.max(...products.map((choice) => choice.batch));
        services.dialog.openSkillMulti(player, {
            id: `smelt_skillmulti_${player.id}`,
            title: "How many would you like to smelt?",
            products: products.map((choice) => ({
                itemId: choice.recipe.outputItemId,
                label: choice.recipe.name,
                maxQuantity: choice.batch,
            })),
            maxQuantity,
            defaultQuantity: 1,
            onSelect: (index, quantity) => {
                const selected = products[index];
                if (!selected) {
                    services.messaging.sendGameMessage(player, "You decide not to smelt anything.");
                    return;
                }
                trySmeltRecipe(player, selected.recipe, tick, {
                    desiredCount: Math.max(1, Math.min(selected.batch, quantity | 0)),
                    facilityLocId,
                });
            },
        });
    };

    registry.registerLocAction("smelt", (event) => {
        openSmeltDialog(event.player, event.tick, undefined, event.locId);
    });

    const oreItemIds = new Set<number>();
    for (const recipe of SMELTING_RECIPES) {
        for (const input of recipe.inputs) oreItemIds.add(input.itemId);
    }
    for (const oreItemId of oreItemIds) {
        registry.registerItemOnLoc(oreItemId, ANY_LOC_ID, (event) => {
            const locDef = services.data.getLocDefinition(event.target.locId);
            if (!locDef) return;
            const actions = locDef.actions ?? [];
            if (!actions.some((a: string) => a?.toLowerCase() === "smelt")) return;
            const match = SMELTING_RECIPES.find((r) =>
                r.inputs.some((i) => i.itemId === event.source.itemId),
            );
            openSmeltDialog(event.player, event.tick, match?.id, event.target.locId);
        });
    }
}
