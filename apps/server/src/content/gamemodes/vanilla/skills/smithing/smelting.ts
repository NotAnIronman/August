import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import {
    ANY_LOC_ID,
    type IScriptRegistry,
    type ScriptActionHandlerContext,
    type ScriptServices,
} from "@server/game/scripts/types";
import {
    type ProductionRecipePolicy,
    defineProductionSkill,
} from "@server/game/skilling/ProductionSkill";
import {
    MAX_BATCH,
    buildSkillFailure,
    clampBatchCount,
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

function describeBar(services: ScriptServices, itemId: number): string {
    return services.data.getObjType(itemId)?.name ?? "bar";
}

const SMELTING_RECIPES_CORE: ProductionRecipePolicy<SmeltingRecipe>[] = SMELTING_RECIPES.map(
    (recipe) => ({
        id: recipe.id,
        source: recipe,
        level: recipe.level,
        levelSource: "effective" as const,
        inputs: recipe.inputs,
        outputs: [
            { itemId: recipe.outputItemId, quantity: Math.max(1, recipe.outputQuantity) },
        ],
        tools:
            recipe.requiredToolItemIds && recipe.requiredToolItemIds.length > 0
                ? [
                      {
                          itemIds: recipe.requiredToolItemIds,
                          source: "inventory" as const,
                          match: "any" as const,
                      },
                  ]
                : undefined,
        xp: recipe.xp,
        animationId: recipe.animation ?? FURNACE_ANIMATION,
        ticks: recipe.delayTicks ?? 4,
        outputPlacement: "first-consumed-slot",
    }),
);

const SMELTING = defineProductionSkill({
    name: "smelt",
    skillId: SkillId.Smithing,
    requestGroups: ["skill.surface"],
    recipes: SMELTING_RECIPES_CORE,
    messages: {
        unknownRecipe: "You can't smelt that bar.",
        missingLevel: (recipe) => `You need Smithing level ${recipe.level} to smelt that.`,
        missingInputs: () => "You need the right ores to smelt that.",
        missingTools: () => "You need the right mould to make that.",
        inventoryFull: () => "You need more inventory space for the bar.",
        success: (recipe, outcome, context) =>
            outcome.variant === "failed"
                ? "The iron ore is too impure and you fail to produce a bar."
                : `You retrieve a ${describeBar(context.services, recipe.source.outputItemId).toLowerCase()}.`,
        interrupted: "You stop smelting.",
    },
    resolveOutcome: ({ player, services, recipe, random }) => {
        const equip = services.equipment.getEquipArray(player) ?? [];
        const ringCharges =
            recipe.source.successType === "iron" ? getRingOfForgingCharges(player) : undefined;
        const level = services.skills.getSkill(player, SkillId.Smithing)?.baseLevel ?? 1;
        const success = rollSmeltingSuccess(level, recipe.source, equip, ringCharges, random);
        return success
            ? {
                  variant: "success",
                  xp: getSmeltingXpWithBonuses(recipe.source, equip),
              }
            : {
                  variant: "failed",
                  outputs: [],
                  animationId: -1,
                  awardXp: false,
                  emitCraftEvents: false,
              };
    },
    afterStep: ({ player, services, recipe }, outcome) => {
        if (outcome.variant === "success" && recipe.source.successType === "iron") {
            consumeRingOfForgingCharge(player, services);
        }
    },
    buildRepeatData: ({ recipe, data }, remaining) => ({
        recipeId: recipe.id,
        count: remaining,
        facilityLocId: data.facilityLocId,
    }),
});

function rollSmeltingSuccess(
    level: number,
    recipe: SmeltingRecipe,
    equip: number[],
    ringCharges?: number,
    random: () => number = Math.random,
): boolean {
    if (shouldGuaranteeIronSmelt(recipe, equip, ringCharges)) return true;
    if (recipe.successType === "iron") {
        const chance = calculateIronSmeltChance(level);
        return random() < chance;
    }
    return true;
}

export function executeSmeltAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, services } = ctx;
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

    // Preserve the established failure ordering: the level requirement is
    // reported before a restricted furnace mismatch.
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

    const result = SMELTING.execute(ctx);
    if (!result.ok) {
        if (result.reason === "level") result.reason = "smelt_level";
        else if (result.reason === "tool") result.reason = "missing_tool";
        else if (result.reason === "materials") result.reason = "missing_ore";
    }
    services.production?.updateSmeltingInterface?.(player);
    return result;
}

type SmeltChoice = {
    recipe: SmeltingRecipe;
    batch: number;
};

export function registerSmeltingInteractions(registry: IScriptRegistry, services: ScriptServices) {
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
        const policy = SMELTING.getRecipe(recipe.id);
        if (
            !policy ||
            !SMELTING.request(services, player, policy, desired, tick, {
                facilityLocId: opts?.facilityLocId,
            })
        ) {
            services.messaging.sendGameMessage(player, "You can't smelt right now.");
        }
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
                // The selection can happen long after the furnace click; use
                // the live scheduler tick so recipe timing cannot be skipped.
                trySmeltRecipe(player, selected.recipe, undefined, {
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
