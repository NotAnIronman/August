import { SkillId } from "@august/osrs-engine/skill/skills";
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
import { getSkillLevel } from "@server/game/skilling/Requirements";
import {
    ALL_CRAFTING_RECIPES,
    GEM_RECIPES,
    GLASS_RECIPES,
    JEWELLERY_RECIPES,
    LEATHER_RECIPES,
    SILVER_RECIPES,
    type CraftingRecipe,
} from "@server/content/gamemodes/vanilla/skills/crafting/productionData";

const CRAFTING_RECIPES: ProductionRecipePolicy<CraftingRecipe>[] =
    ALL_CRAFTING_RECIPES.map((recipe) => ({
        id: recipe.id,
        source: recipe,
        level: recipe.level,
        levelSource: "effective" as const,
        inputs: recipe.inputs,
        outputs: [
            { itemId: recipe.outputItemId, quantity: Math.max(1, recipe.outputQuantity ?? 1) },
        ],
        tools: recipe.toolItemIds?.map((itemId) => ({
            itemIds: [itemId],
            source: "inventory" as const,
        })),
        xp: recipe.xp,
        animationId: recipe.animation ?? 884,
        ticks: recipe.delayTicks ?? 3,
        outputPlacement: "first-consumed-slot",
    }));

const CRAFTING = defineProductionSkill({
    name: "craft",
    skillId: SkillId.Crafting,
    recipes: CRAFTING_RECIPES,
    messages: {
        unknownRecipe: "",
        missingLevel: (recipe) => `You need Crafting level ${recipe.level} to make that.`,
        missingInputs: () => "You no longer have the materials or tools to make that.",
        missingTools: () => "You no longer have the materials or tools to make that.",
        inventoryFull: () => "You need more inventory space to make that.",
        success: () => "",
        interrupted: "",
    },
});

const policyFor = (recipe: CraftingRecipe): ProductionRecipePolicy<CraftingRecipe> | undefined =>
    CRAFTING.getRecipe(recipe.id);

const effectiveLevel = (player: PlayerState, services: ScriptServices): number =>
    getSkillLevel(services, player, SkillId.Crafting);

const canMake = (
    player: PlayerState,
    services: ScriptServices,
    recipe: CraftingRecipe,
): boolean => {
    const policy = policyFor(recipe);
    // Keep insufficient-level products visible so the established selection
    // path can explain the level requirement after the player chooses one.
    return !!policy && CRAFTING.hasMaterials(services, player, policy);
};

const maxBatch = (
    player: PlayerState,
    services: ScriptServices,
    recipe: CraftingRecipe,
): number => {
    const policy = policyFor(recipe);
    return policy ? CRAFTING.maxBatch(services, player, policy, 28) : 0;
};

function execute(ctx: ScriptActionHandlerContext) {
    return CRAFTING.execute(ctx);
}

function open(
    player: PlayerState,
    services: ScriptServices,
    recipes: readonly CraftingRecipe[],
    title: string,
): void {
    const available = recipes.filter((recipe) => canMake(player, services, recipe));
    if (!available.length) {
        services.messaging.sendGameMessage(
            player,
            "You don't have the materials needed to make anything.",
        );
        return;
    }
    services.dialog.openSkillMulti(player, {
        id: `craft_${player.id}`,
        title,
        products: available.map((recipe) => ({
            itemId: recipe.outputItemId,
            label: recipe.name,
            maxQuantity: maxBatch(player, services, recipe),
        })),
        maxQuantity: Math.max(...available.map((recipe) => maxBatch(player, services, recipe))),
        defaultQuantity: 1,
        onSelect: (index, quantity) => {
            const recipe = available[index];
            if (!recipe) return;
            if (effectiveLevel(player, services) < recipe.level) {
                services.messaging.sendGameMessage(
                    player,
                    `You need Crafting level ${recipe.level} to make that.`,
                );
                return;
            }
            const policy = policyFor(recipe);
            if (!policy) return;
            const desired = Math.max(1, Math.min(maxBatch(player, services, recipe), quantity | 0));
            if (!CRAFTING.request(services, player, policy, desired)) {
                services.messaging.sendGameMessage(player, "You're too busy to craft right now.");
            }
        },
    });
}

export function registerCraftingProduction(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    registry.registerActionHandler(CRAFTING.actionKind, execute);
    for (const recipe of GEM_RECIPES) {
        registry.registerItemOnItem(recipe.inputs[0].itemId, 1755, (event) =>
            open(event.player, services, [recipe], "Cut gem"),
        );
    }
    for (const hide of new Set(LEATHER_RECIPES.map((recipe) => recipe.inputs[0].itemId))) {
        registry.registerItemOnItem(hide, 1733, (event) =>
            open(
                event.player,
                services,
                LEATHER_RECIPES.filter((recipe) => recipe.inputs[0].itemId === hide),
                "What would you like to make?",
            ),
        );
    }
    registry.registerItemOnLoc(2357, ANY_LOC_ID, (event) => {
        const actions = services.data.getLocDefinition(event.target.locId)?.actions ?? [];
        if (actions.some((action: string) => action?.toLowerCase() === "smelt")) {
            open(event.player, services, JEWELLERY_RECIPES, "What would you like to make?");
        }
    });
    registry.registerItemOnLoc(2355, ANY_LOC_ID, (event) => {
        const actions = services.data.getLocDefinition(event.target.locId)?.actions ?? [];
        if (actions.some((action: string) => action?.toLowerCase() === "smelt")) {
            open(event.player, services, SILVER_RECIPES, "What would you like to make?");
        }
    });
    registry.registerItemOnLoc(1783, ANY_LOC_ID, (event) => {
        const actions = services.data.getLocDefinition(event.target.locId)?.actions ?? [];
        if (actions.some((action: string) => action?.toLowerCase() === "smelt")) {
            open(event.player, services, [GLASS_RECIPES[0]], "Make molten glass");
        }
    });
    registry.registerItemOnItem(1775, 1785, (event) =>
        open(event.player, services, GLASS_RECIPES.slice(1), "What would you like to make?"),
    );
}
