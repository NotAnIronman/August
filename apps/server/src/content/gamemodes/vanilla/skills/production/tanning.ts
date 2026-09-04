import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type {
    IScriptRegistry,
    ScriptActionHandlerContext,
    ScriptInventoryEntry,
    ScriptServices,
} from "@server/game/scripts/types";
import {
    type ProductionRecipePolicy,
    defineProductionSkill,
} from "@server/game/skilling/ProductionSkill";
import {
    MAX_BATCH,
    MAX_DIALOG_OPTIONS,
    SKILL_DIALOG_META,
    type SkillDialogChoice,
    clampBatchCount,
    countItem,
    getInventory,
    hasItem,
} from "@server/content/gamemodes/vanilla/skills/production/productionActions";
import {
    TANNING_RECIPES,
    type TanningRecipe,
} from "@server/content/gamemodes/vanilla/skills/production/tanningData";

const TANNING_RECIPES_CORE: ProductionRecipePolicy<TanningRecipe>[] = TANNING_RECIPES.map(
    (recipe) => ({
        id: recipe.id,
        source: recipe,
        level: recipe.level ?? 1,
        levelSource: "base" as const,
        inputs: [{ itemId: recipe.inputItemId, quantity: 1 }],
        outputs: [{ itemId: recipe.outputItemId, quantity: 1 }],
        xp: recipe.xp,
        animationId: recipe.animation ?? 1249,
        ticks: recipe.delayTicks ?? 2,
        outputPlacement: "first-consumed-slot",
    }),
);

const TANNING = defineProductionSkill({
    name: "tan",
    skillId: SkillId.Crafting,
    requestGroups: ["skill.surface"],
    recipes: TANNING_RECIPES_CORE,
    messages: {
        unknownRecipe: "You can't tan that.",
        missingLevel: (recipe) => `You need Crafting level ${recipe.level} to tan that.`,
        missingInputs: () => "You need hides to tan.",
        missingTools: () => "You need hides to tan.",
        inventoryFull: () => "You need more inventory space to tan that.",
        success: (recipe) => `You tan the hide into ${recipe.source.name}.`,
        interrupted: "You stop tanning because you're already busy.",
    },
    resolveOutcome: () => ({ emitCraftEvents: false }),
});

const computeTanningBatchCount = (
    entries: ScriptInventoryEntry[],
    recipe: TanningRecipe,
): number => clampBatchCount(countItem(entries, recipe.inputItemId));

function policyFor(recipe: TanningRecipe): ProductionRecipePolicy<TanningRecipe> | undefined {
    return TANNING.getRecipe(recipe.id);
}

export function executeTanAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    return TANNING.execute(ctx);
}

export function registerTanningInteractions(
    registry: IScriptRegistry,
    services: ScriptServices,
) {
    const openDialogOptions = services.dialog.openDialogOptions;
    const closeDialog = services.dialog.closeDialog;

    const tryTanningRecipe = (
        player: PlayerState,
        recipe: TanningRecipe,
        tick?: number,
        opts?: { desiredCount?: number },
    ) => {
        const craftLevel = services.skills.getSkill(player, SkillId.Crafting)?.baseLevel ?? 1;
        if (recipe.level && craftLevel < recipe.level) {
            services.messaging.sendGameMessage(
                player,
                `You need Crafting level ${recipe.level} to tan that.`,
            );
            return;
        }
        const inventoryNow = getInventory(services, player);
        const policy = policyFor(recipe);
        const batch = policy
            ? TANNING.maxBatch(services, player, policy, MAX_BATCH)
            : computeTanningBatchCount(inventoryNow, recipe);
        if (batch <= 0) {
            services.messaging.sendGameMessage(player, "You need hides to tan.");
            return;
        }
        const desired = Math.max(1, Math.min(batch, opts?.desiredCount ?? batch));
        if (!policy || !TANNING.request(services, player, policy, desired, tick)) {
            services.messaging.sendGameMessage(player, "You can't tan right now.");
        }
    };

    registry.registerLocAction("tan", (event) => {
        const level = services.skills.getSkill(event.player, SkillId.Crafting)?.baseLevel ?? 1;
        const inventory = getInventory(services, event.player);
        const tanningCandidates = TANNING_RECIPES.filter((recipe) =>
            hasItem(inventory, recipe.inputItemId),
        ).map<SkillDialogChoice<TanningRecipe>>((recipe) => {
            const totalHides = countItem(inventory, recipe.inputItemId);
            const levelMet = !recipe.level || level >= recipe.level;
            const craftable = levelMet && totalHides > 0;
            const readyCount = Math.max(1, Math.min(MAX_BATCH, totalHides));
            const label = craftable
                ? `${recipe.name} (${readyCount}x ready)`
                : !levelMet
                  ? `${recipe.name} (Lvl ${recipe.level})`
                  : `${recipe.name} (${totalHides} hides)`;
            return { recipe, label, craftable, batch: readyCount };
        });
        if (!tanningCandidates.length) {
            services.messaging.sendGameMessage(event.player, "You need hides to tan.");
            return;
        }
        const craftableChoices = tanningCandidates.filter((choice) => choice.craftable);
        const orderedChoices = craftableChoices
            .concat(tanningCandidates.filter((choice) => !choice.craftable))
            .slice(0, MAX_DIALOG_OPTIONS);
        const meta = SKILL_DIALOG_META.tan;
        const openedDialog =
            openDialogOptions &&
            orderedChoices.length > 0 &&
            openDialogOptions(event.player, {
                id: meta.id,
                title: meta.title,
                modal: true,
                options: orderedChoices.map((choice) => choice.label),
                disabledOptions: orderedChoices.map((choice) => !choice.craftable),
                onSelect: (index) => {
                    const selected = orderedChoices[index];
                    if (!selected) {
                        services.messaging.sendGameMessage(
                            event.player,
                            "You decide not to tan any hides.",
                        );
                        return;
                    }
                    if (!selected.craftable) {
                        services.messaging.sendGameMessage(event.player, "You can't tan that yet.");
                        return;
                    }
                    closeDialog?.(event.player, meta.id);
                    tryTanningRecipe(event.player, selected.recipe, undefined, {
                        desiredCount: selected.batch,
                    });
                },
            });
        if (!openedDialog) {
            const fallback = craftableChoices[0];
            if (!fallback) {
                services.messaging.sendGameMessage(
                    event.player,
                    "You need a higher Crafting level.",
                );
                return;
            }
            tryTanningRecipe(event.player, fallback.recipe, event.tick, {
                desiredCount: fallback.batch,
            });
        }
    });
}
