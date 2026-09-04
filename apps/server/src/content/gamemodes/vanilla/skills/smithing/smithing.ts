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
import { hasTool } from "@server/game/skilling/Requirements";
import { getInventory, hasItem } from "@server/content/gamemodes/vanilla/skills/production/productionActions";
import {
    HAMMER_ITEM_ID,
    IMCANDO_HAMMER_ITEM_IDS,
    SMITHING_RECIPES,
    type SmithingRecipe,
} from "@server/content/gamemodes/vanilla/skills/smithing/smithingData";

const SMITHING_HAMMERS = [HAMMER_ITEM_ID, ...IMCANDO_HAMMER_ITEM_IDS];
const SMITHING_RECIPES_CORE: ProductionRecipePolicy<SmithingRecipe>[] = SMITHING_RECIPES.map(
    (recipe) => ({
        id: recipe.id,
        source: recipe,
        level: recipe.level,
        levelSource: "effective" as const,
        inputs: [{ itemId: recipe.barItemId, quantity: Math.max(1, recipe.barCount) }],
        outputs: [
            { itemId: recipe.outputItemId, quantity: Math.max(1, recipe.outputQuantity) },
        ],
        tools:
            recipe.requireHammer === false
                ? undefined
                : [{ itemIds: SMITHING_HAMMERS, source: "carried" as const }],
        xp: recipe.xp,
        animationId: recipe.animation ?? 898,
        ticks: recipe.delayTicks ?? 4,
        outputPlacement: "first-consumed-slot",
    }),
);

const SMITHING = defineProductionSkill({
    name: "smith",
    skillId: SkillId.Smithing,
    recipes: SMITHING_RECIPES_CORE,
    messages: {
        unknownRecipe: "You can't smith that.",
        missingLevel: (recipe) => `You need Smithing level ${recipe.level} to smith that.`,
        missingInputs: () => "You need more bars.",
        missingTools: () => "You need a hammer to smith items.",
        inventoryFull: () => "You need more inventory space to smith that.",
        success: (recipe) => {
            const source = recipe.source;
            return `You smith ${
                source.outputQuantity > 1
                    ? `${source.outputQuantity} ${source.name}`
                    : `a ${source.name}`
            }.`;
        },
        interrupted: "You stop smithing because you're already busy.",
    },
});

function hasSmithingHammer(player: PlayerState, services: ScriptServices): boolean {
    return hasTool(services, player, { itemIds: SMITHING_HAMMERS, source: "carried" });
}

export function executeSmithAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const result = SMITHING.execute(ctx);
    if (!result.ok) {
        if (result.reason === "level") result.reason = "smith_level";
        else if (result.reason === "tool") result.reason = "hammer";
        else if (result.reason === "materials") result.reason = "missing_bars";
    }
    ctx.services.production?.updateSmithingInterface?.(ctx.player);
    return result;
}

export function registerSmithingInteractions(
    registry: IScriptRegistry,
    services: ScriptServices,
) {
    const openForge = (player: PlayerState, barItemId?: number) => {
        const inventory = getInventory(services, player);
        if (!hasSmithingHammer(player, services)) {
            services.messaging.sendGameMessage(player, "You need a hammer to smith.");
            return;
        }
        const hasBars =
            barItemId !== undefined
                ? hasItem(inventory, barItemId)
                : SMITHING_RECIPES.some((recipe) => hasItem(inventory, recipe.barItemId));
        if (!hasBars) {
            services.messaging.sendGameMessage(
                player,
                barItemId !== undefined
                    ? "You need metal bars to smith."
                    : "You should select an item from your inventory and use it on the anvil.",
            );
            return;
        }
        services.production?.openForgeInterface?.(player, barItemId);
    };

    registry.registerLocAction("smith", (event) => openForge(event.player));

    const barItemIds = new Set(SMITHING_RECIPES.map((recipe) => recipe.barItemId));
    for (const barItemId of barItemIds) {
        registry.registerItemOnLoc(barItemId, ANY_LOC_ID, (event) => {
            const locDef = services.data.getLocDefinition(event.target.locId);
            if (!locDef) return;
            const actions = locDef.actions ?? [];
            if (!actions.some((action: string) => action?.toLowerCase() === "smith")) return;
            openForge(event.player, event.source.itemId);
        });
    }
}
