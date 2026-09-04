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
import { getSkillLevel } from "@server/game/skilling/Requirements";
import {
    type SkillActionPolicy,
    defineSkillAction,
    requestSkillAction,
} from "@server/game/skilling/SkillAction";
import {
    COOKING_RECIPES,
    type CookingHeatSource,
    type CookingRecipe,
    DEFAULT_COOKING_BURN_BONUS,
    getCookingRecipeById,
    getCookingRecipeByRawItemId,
    rollCookingOutcome,
} from "@server/content/gamemodes/vanilla/skills/production/cookingData";
import {
    MAX_BATCH,
    MAX_DIALOG_OPTIONS,
    SKILL_DIALOG_META,
    type SkillDialogChoice,
    countItem,
    getInventory,
    hasItem,
    resolveCookingHeatSource,
} from "@server/content/gamemodes/vanilla/skills/production/productionActions";

const COOKING_RECIPES_CORE: ProductionRecipePolicy<CookingRecipe>[] = COOKING_RECIPES.map(
    (recipe) => ({
        id: recipe.id,
        source: recipe,
        level: recipe.level,
        levelSource: "effective" as const,
        inputs: [{ itemId: recipe.rawItemId, quantity: 1 }],
        outputs: [{ itemId: recipe.cookedItemId, quantity: 1 }],
        xp: recipe.xp,
        animationId: recipe.animation ?? 897,
        ticks: recipe.delayTicks ?? 3,
        outputPlacement: "first-consumed-slot",
    }),
);

// Ground fires keep their established one-off timing and action group rather
// than acquiring the broader modal surface lock used by range interactions.
const DIRECT_FIRE_COOK_ACTIONS = new Map<string, SkillActionPolicy>(
    COOKING_RECIPES.map((recipe) => [
        recipe.id,
        defineSkillAction("cook", { delayTicks: recipe.delayTicks ?? 4 }),
    ]),
);

const COOKING = defineProductionSkill({
    name: "cook",
    skillId: SkillId.Cooking,
    requestGroups: ["skill.surface"],
    recipes: COOKING_RECIPES_CORE,
    messages: {
        unknownRecipe: "You can't cook that.",
        missingLevel: (recipe) => `You need Cooking level ${recipe.level} to cook that.`,
        missingInputs: () => "You need raw food to cook.",
        missingTools: () => "You need raw food to cook.",
        inventoryFull: () => "You need more inventory space to cook that.",
        success: (recipe, outcome) =>
            outcome.variant === "burn"
                ? `You accidentally burn the ${recipe.source.name}.`
                : `You cook the ${recipe.source.name}.`,
        interrupted: "You stop cooking because you're already busy.",
    },
    resolveOutcome: ({ services, player, recipe, data, random }) => {
        const heatSource = String(data.heatSource ?? "").toLowerCase() === "fire" ? "fire" : "range";
        const level = getSkillLevel(services, player, SkillId.Cooking);
        const burnBonus = heatSource === "fire" ? 0 : DEFAULT_COOKING_BURN_BONUS;
        const outcome = rollCookingOutcome(recipe.source, level, { burnBonus, rng: random });
        const cooked = outcome === "success";
        const burntItemId = recipe.source.burntItemId ?? -1;
        return {
            variant: outcome,
            outputs: [
                {
                    itemId: cooked || !(burntItemId > 0) ? recipe.source.cookedItemId : burntItemId,
                    quantity: 1,
                },
            ],
            awardXp: cooked,
            emitCraftEvents: cooked,
        };
    },
    buildRepeatData: ({ recipe, data }, remaining) => ({
        recipeId: recipe.id,
        count: remaining,
        heatSource: String(data.heatSource ?? "").toLowerCase() === "fire" ? "fire" : "range",
    }),
});

export function executeCookAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const result = COOKING.execute(ctx);
    if (!result.ok) {
        if (result.reason === "level") result.reason = "cook_level";
        else if (result.reason === "materials") result.reason = "missing_item";
    }
    return result;
}

export function registerCookingInteractions(registry: IScriptRegistry, services: ScriptServices) {
    const openDialogOptions = services.dialog.openDialogOptions;
    const closeDialog = services.dialog.closeDialog;

    const tryCookingRecipe = (
        player: PlayerState,
        recipe: CookingRecipe,
        tick?: number,
        opts?: { desiredCount?: number; heatSource?: CookingHeatSource },
    ) => {
        const cookLevel = getSkillLevel(services, player, SkillId.Cooking, "effective");
        if (cookLevel < recipe.level) {
            services.messaging.sendGameMessage(
                player,
                `You need Cooking level ${recipe.level} to cook that.`,
            );
            return;
        }
        const inventoryNow = getInventory(services, player);
        const batch = Math.max(0, Math.min(MAX_BATCH, countItem(inventoryNow, recipe.rawItemId)));
        if (batch <= 0) {
            services.messaging.sendGameMessage(player, "You need something raw to cook.");
            return;
        }
        const desired = Math.max(1, Math.min(batch, opts?.desiredCount ?? batch));
        const policy = COOKING.getRecipe(recipe.id);
        if (
            !policy ||
            !COOKING.request(
                services,
                player,
                policy,
                desired,
                tick,
                opts?.heatSource ? { heatSource: opts.heatSource } : undefined,
            )
        ) {
            services.messaging.sendGameMessage(player, "You can't cook right now.");
        }
    };

    registry.registerLocAction("cook", (event) => {
        const level = getSkillLevel(services, event.player, SkillId.Cooking, "effective");
        const inventory = getInventory(services, event.player);
        const heatSource = resolveCookingHeatSource(services, event.locId);
        const cookingCandidates = COOKING_RECIPES.filter((r) =>
            hasItem(inventory, r.rawItemId),
        ).map<SkillDialogChoice<CookingRecipe>>((recipe) => {
            const totalRaw = countItem(inventory, recipe.rawItemId);
            const levelMet = level >= recipe.level;
            const craftable = levelMet && totalRaw > 0;
            const readyCount = Math.max(1, Math.min(MAX_BATCH, totalRaw));
            const label = craftable
                ? `${recipe.name} (${readyCount}x ready)`
                : !levelMet
                  ? `${recipe.name} (Lvl ${recipe.level})`
                  : `${recipe.name} (${totalRaw} raw)`;
            return { recipe, label, craftable, batch: readyCount };
        });
        if (!cookingCandidates.length) {
            services.messaging.sendGameMessage(event.player, "You need something raw to cook.");
            return;
        }
        const craftableChoices = cookingCandidates.filter((c) => c.craftable);
        const orderedChoices = craftableChoices
            .concat(cookingCandidates.filter((c) => !c.craftable))
            .slice(0, MAX_DIALOG_OPTIONS);
        const meta = SKILL_DIALOG_META.cook;
        const openedDialog =
            openDialogOptions &&
            orderedChoices.length > 0 &&
            openDialogOptions(event.player, {
                id: meta.id,
                title: meta.title,
                modal: true,
                options: orderedChoices.map((c) => c.label),
                disabledOptions: orderedChoices.map((c) => !c.craftable),
                onSelect: (idx) => {
                    const selected = orderedChoices[idx];
                    if (!selected) {
                        services.messaging.sendGameMessage(event.player, "You stop cooking.");
                        return;
                    }
                    if (!selected.craftable) {
                        services.messaging.sendGameMessage(
                            event.player,
                            "You can't cook that yet.",
                        );
                        return;
                    }
                    closeDialog?.(event.player, meta.id);
                    // Dialogs may remain open for many ticks. Resolve the live
                    // clock when the player chooses so the full cook delay is kept.
                    tryCookingRecipe(event.player, selected.recipe, undefined, {
                        desiredCount: selected.batch,
                        heatSource,
                    });
                },
            });
        if (!openedDialog) {
            const fallback = craftableChoices[0];
            if (!fallback) {
                services.messaging.sendGameMessage(
                    event.player,
                    "You need a higher Cooking level.",
                );
                return;
            }
            tryCookingRecipe(event.player, fallback.recipe, event.tick, {
                desiredCount: fallback.batch,
                heatSource,
            });
        }
    });

    const rawItemIds = new Set(COOKING_RECIPES.map((r) => r.rawItemId));
    for (const rawItemId of rawItemIds) {
        registry.registerItemOnLoc(rawItemId, ANY_LOC_ID, (event) => {
            const tile = event.target.tile;
            const level = event.target.level;
            const fire = services.gathering?.getTracker("firemaking")?.hasTile(tile, level);
            if (!fire) return;
            const recipe = getCookingRecipeByRawItemId(event.source.itemId);
            if (!recipe) return;
            const player = event.player;
            const action = DIRECT_FIRE_COOK_ACTIONS.get(recipe.id);
            if (!action) return;
            const requested = requestSkillAction(
                services,
                player,
                action,
                {
                    recipeId: recipe.id,
                    count: 1,
                    heatSource: "fire" as CookingHeatSource,
                },
                event.tick,
            );
            if (!requested) {
                services.messaging.sendGameMessage(player, "You're too busy to do that right now.");
                return;
            }
            services.messaging.sendGameMessage(player, "You start cooking.");
        });
    }
}
