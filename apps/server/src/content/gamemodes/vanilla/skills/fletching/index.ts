import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type { ItemOnItemEvent } from "@server/game/scripts/types";
import type {
    IScriptRegistry,
    ScriptActionHandlerContext,
    ScriptInventoryEntry,
    ScriptServices,
} from "@server/game/scripts/types";
import { countInventoryItem } from "@server/game/skilling/InventoryTransform";
import {
    type ProductionRecipePolicy,
    defineProductionSkill,
} from "@server/game/skilling/ProductionSkill";
import {
    FLETCHING_COMBINE_RECIPES,
    FLETCHING_LOG_IDS,
    FLETCHING_RECIPES,
    FLETCHING_STRING_IDS,
    type FletchingProductDefinition,
    KNIFE_ITEM_ID,
    getFletchingProductsForLog,
    getFletchingRecipeById,
    getStringingRecipeByUnstrungId,
} from "@server/content/gamemodes/vanilla/skills/fletching/fletchingData";

const MAX_BATCH = 27;
const FLETCHING_GROUP = "skill.fletch";

type InventoryEntry = ScriptInventoryEntry;

const getEffectiveFletchingLevel = (services: ScriptServices, player: PlayerState): number => {
    const skill = services.skills.getSkill(player, SkillId.Fletching);
    return Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0));
};

const countItemQuantity = (entries: InventoryEntry[], itemId: number): number => {
    return countInventoryItem(entries, itemId);
};

const formatProductLabel = (
    def: FletchingProductDefinition,
    opts: { craftable: boolean; available: number; levelMet: boolean },
): string => {
    const name = def.productName;
    if (!opts.levelMet) {
        return `${name} (Lvl ${def.level})`;
    }
    if (!opts.craftable) {
        return `${name} (Need logs)`;
    }
    return `${name} (${opts.available} ready)`;
};

const buildBatchOptions = (maxBatch: number): Array<{ label: string; count: number }> => {
    if (!(maxBatch > 0)) return [];
    return [1, 5, 10, maxBatch]
        .filter(
            (value, index, arr) => value > 0 && value <= maxBatch && arr.indexOf(value) === index,
        )
        .sort((a, b) => a - b)
        .map((count) => ({
            label: count === maxBatch ? `Make All (${maxBatch})` : `Make ${count}`,
            count,
        }));
};

const enqueueFletchingAction = (
    services: ScriptServices,
    player: PlayerState,
    recipe: FletchingProductDefinition,
    desiredCount: number,
    tick?: number,
): boolean => {
    const policy = FLETCHING.getRecipe(recipe.id);
    return !!policy && FLETCHING.request(services, player, policy, desiredCount, tick);
};

// ---------------------------------------------------------------------------
// Fletching action data
// ---------------------------------------------------------------------------

interface FletchActionData {
    recipeId: string;
    count: number;
}

function buildMessageEffect(player: PlayerState, message: string): ActionEffect {
    return { type: "message", playerId: player.id, message };
}

function getFletchingMissingInputMessage(recipe: FletchingProductDefinition): {
    message: string;
    reason: string;
} {
    if (recipe.mode === "string")
        return {
            message: "You need unstrung bows in your inventory to keep fletching.",
            reason: "missing_unstrung",
        };
    if (recipe.kind === "headless_arrow")
        return {
            message: "You need arrow shafts in your inventory to keep fletching.",
            reason: "missing_arrow_shafts",
        };
    if (recipe.kind === "arrow")
        return {
            message: "You need headless arrows in your inventory to keep fletching.",
            reason: "missing_headless_arrows",
        };
    if (["arrowtips", "bolt_tips", "javelin_heads", "dart_tips"].includes(recipe.kind ?? ""))
        return {
            message: "You need amethyst in your inventory to keep fletching.",
            reason: "missing_amethyst",
        };
    if (recipe.kind === "bolt")
        return {
            message: "You need broad bolts in your inventory to keep fletching.",
            reason: "missing_broad_bolts",
        };
    if (recipe.kind === "javelin")
        return {
            message: "You need javelin shafts in your inventory to keep fletching.",
            reason: "missing_javelin_shafts",
        };
    if (recipe.kind === "dart")
        return {
            message: "You need amethyst dart tips in your inventory to keep fletching.",
            reason: "missing_dart_tips",
        };
    return {
        message: "You need logs in your inventory to keep fletching.",
        reason: "missing_logs",
    };
}

function getFletchingMissingSecondaryMessage(recipe: FletchingProductDefinition): {
    message: string;
    reason: string;
} {
    if (recipe.mode === "string")
        return { message: "You need bowstrings to keep fletching.", reason: "missing_bowstring" };
    if (recipe.kind === "headless_arrow" || recipe.kind === "dart")
        return { message: "You need feathers to keep fletching.", reason: "missing_feathers" };
    if (recipe.kind === "arrow")
        return { message: "You need arrowtips to keep fletching.", reason: "missing_arrowtips" };
    if (["arrowtips", "bolt_tips", "javelin_heads", "dart_tips"].includes(recipe.kind ?? "")) {
        const label = recipe.secondaryLabel ?? "a chisel";
        return { message: `You need ${label} to keep fletching.`, reason: "missing_tool" };
    }
    if (recipe.kind === "bolt")
        return {
            message: "You need amethyst bolt tips to keep fletching.",
            reason: "missing_bolt_tips",
        };
    if (recipe.kind === "javelin")
        return {
            message: "You need amethyst javelin heads to keep fletching.",
            reason: "missing_javelin_heads",
        };
    return {
        message: "You need the other ingredient to keep fletching.",
        reason: "missing_secondary_item",
    };
}

function getFletchingSuccessMessage(recipe: FletchingProductDefinition): string {
    if (recipe.successMessage) return recipe.successMessage;
    if (recipe.mode === "string") return `You string the ${recipe.productName}.`;
    if (recipe.kind === "arrow_shafts")
        return `You whittle the logs into ${recipe.outputQuantity} ${recipe.productName}.`;
    if (recipe.kind === "headless_arrow") return "You attach feathers to the arrow shafts.";
    if (recipe.kind === "arrow") return `You add the tips to make ${recipe.productName}s.`;
    if (["arrowtips", "bolt_tips", "javelin_heads", "dart_tips"].includes(recipe.kind ?? ""))
        return `You carve the ${recipe.productName}.`;
    if (recipe.kind === "bolt") return "You attach the amethyst tips to the bolts.";
    if (recipe.kind === "javelin") return "You attach the amethyst heads to the javelins.";
    if (recipe.kind === "dart") return "You add feathers to the dart tips.";
    return `You fletch the logs into ${recipe.productName}.`;
}

const FLETCHING_RECIPES_CORE: ProductionRecipePolicy<FletchingProductDefinition>[] =
    FLETCHING_RECIPES.map((recipe) => {
        const consumeSecondary = recipe.consumeSecondary !== false;
        return {
            id: recipe.id,
            source: recipe,
            level: recipe.level,
            levelSource: "effective" as const,
            inputs: [
                { itemId: recipe.inputItemId, quantity: 1 },
                ...(recipe.secondaryItemId !== undefined && consumeSecondary
                    ? [{ itemId: recipe.secondaryItemId, quantity: 1 }]
                    : []),
            ],
            outputs: [
                { itemId: recipe.productItemId, quantity: Math.max(1, recipe.outputQuantity) },
            ],
            tools:
                recipe.secondaryItemId !== undefined && !consumeSecondary
                    ? [{ itemIds: [recipe.secondaryItemId], source: "inventory" as const }]
                    : undefined,
            xp: recipe.xp,
            animationId: recipe.animation ?? 1248,
            ticks: recipe.delayTicks ?? 3,
            outputPlacement:
                recipe.outputMode === "add" ? ("add" as const) : ("first-consumed-slot" as const),
        };
    });

const FLETCHING = defineProductionSkill({
    name: "fletch",
    skillId: SkillId.Fletching,
    recipes: FLETCHING_RECIPES_CORE,
    handledFailureIsOk: true,
    messages: {
        unknownRecipe: "You can't fletch that.",
        missingLevel: (recipe) =>
            `You need Fletching level ${recipe.level} to make that.`,
        missingInputs: (recipe) => getFletchingMissingInputMessage(recipe.source).message,
        missingTools: (recipe) => getFletchingMissingSecondaryMessage(recipe.source).message,
        inventoryFull: () => "You need more inventory space to keep fletching.",
        success: (recipe) => getFletchingSuccessMessage(recipe.source),
        interrupted: "You stop fletching because you're already busy.",
    },
});

function executeFletchAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, tick, services } = ctx;
    const data = ctx.data as FletchActionData;
    const recipeId = data.recipeId;
    const recipe = getFletchingRecipeById(recipeId);
    if (!recipe) {
        return { ok: true, effects: [buildMessageEffect(player, "You can't fletch that.")] };
    }

    if (getEffectiveFletchingLevel(services, player) < recipe.level) {
        return {
            ok: true,
            effects: [
                buildMessageEffect(
                    player,
                    `You need Fletching level ${recipe.level} to make that.`,
                ),
            ],
        };
    }

    const inputSlot = services.inventory.findInventorySlotWithItem(player, recipe.inputItemId);
    if (inputSlot === undefined) {
        const { message } = getFletchingMissingInputMessage(recipe);
        return { ok: true, effects: [buildMessageEffect(player, message)] };
    }

    const secondaryId = recipe.secondaryItemId;
    let secondarySlot: number | undefined;
    if (secondaryId !== undefined) {
        secondarySlot = services.inventory.findInventorySlotWithItem(player, secondaryId);
        if (secondarySlot === undefined) {
            const { message } = getFletchingMissingSecondaryMessage(recipe);
            return { ok: true, effects: [buildMessageEffect(player, message)] };
        }
    }

    return FLETCHING.execute(ctx);
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerActionHandler(FLETCHING.actionKind, executeFletchAction);

    const getInventoryItems = services.inventory.getInventoryItems;
    const openDialogOptions = services.dialog.openDialogOptions;
    const closeDialog = services.dialog.closeDialog;

    const registerHandler = (logId: number) => {
        const handler = ({ player, source, target, tick }: ItemOnItemEvent) => {
            const otherItem = source.itemId === KNIFE_ITEM_ID ? target : source;
            if (otherItem.itemId !== logId) return;
            const products = getFletchingProductsForLog(logId);
            if (!products || products.length === 0) {
                services.messaging.sendGameMessage(
                    player,
                    "You can't fletch anything from these logs.",
                );
                return;
            }
            const inventory = getInventoryItems(player);
            const availableLogs = countItemQuantity(inventory, logId);
            if (availableLogs <= 0) {
                services.messaging.sendGameMessage(
                    player,
                    "You need logs in your inventory to fletch.",
                );
                return;
            }
            const level = getEffectiveFletchingLevel(services, player);
            const choices = products.map((def) => {
                const ready = Math.max(1, Math.min(MAX_BATCH, availableLogs));
                const levelMet = level >= def.level;
                const craftable = levelMet && availableLogs > 0;
                return {
                    definition: def,
                    label: formatProductLabel(def, { craftable, available: ready, levelMet }),
                    craftable,
                    batch: ready,
                };
            });
            const craftableChoices = choices.filter((choice) => choice.craftable);
            if (craftableChoices.length > 0) {
                const maxQuantity = Math.max(...craftableChoices.map((choice) => choice.batch));
                services.dialog.openSkillMulti(player, {
                    id: `fletch_${logId}_${player.id}`,
                    title: "What would you like to make?",
                    products: craftableChoices.map((choice) => ({
                        itemId: choice.definition.productItemId,
                        label: choice.definition.productName,
                        maxQuantity: choice.batch,
                    })),
                    maxQuantity,
                    defaultQuantity: 1,
                    onSelect: (index, quantity) => {
                        const selected = craftableChoices[index];
                        if (!selected) {
                            services.messaging.sendGameMessage(player, "You decide not to carve the logs.");
                            return;
                        }
                        const desired = Math.max(1, Math.min(selected.batch, quantity | 0));
                        if (!enqueueFletchingAction(services, player, selected.definition, desired)) {
                            services.messaging.sendGameMessage(player, "You're too busy to fletch right now.");
                        }
                    },
                });
                return;
            }
            const lowestRequiredLevel = Math.min(...products.map((product) => product.level));
            services.messaging.sendGameMessage(
                player,
                `You need Fletching level ${lowestRequiredLevel} before working these logs.`,
            );
        };
        registry.registerItemOnItem(KNIFE_ITEM_ID, logId, handler);
    };

    const registerStringingHandler = (unstrungId: number) => {
        const recipe = getStringingRecipeByUnstrungId(unstrungId);
        const secondaryItemId = recipe?.secondaryItemId;
        if (!recipe || !secondaryItemId) return;
        const handler = ({ player, source, target, tick }: ItemOnItemEvent) => {
            const sourceIsUnstrung = source.itemId === unstrungId;
            const targetIsUnstrung = target.itemId === unstrungId;
            if (!sourceIsUnstrung && !targetIsUnstrung) return;
            const other = sourceIsUnstrung ? target : source;
            if (other.itemId !== secondaryItemId) return;
            const inventory = getInventoryItems(player);
            const availableUnstrung = countItemQuantity(inventory, unstrungId);
            const availableStrings = countItemQuantity(inventory, secondaryItemId);
            if (availableUnstrung <= 0) {
                services.messaging.sendGameMessage(
                    player,
                    "You need unstrung bows in your inventory.",
                );
                return;
            }
            if (availableStrings <= 0) {
                services.messaging.sendGameMessage(player, "You need bowstrings to string bows.");
                return;
            }
            const level = getEffectiveFletchingLevel(services, player);
            if (level < recipe.level) {
                services.messaging.sendGameMessage(
                    player,
                    `You need Fletching level ${recipe.level} to string that bow.`,
                );
                return;
            }
            const maxBatch = Math.max(
                0,
                Math.min(MAX_BATCH, Math.min(availableUnstrung, availableStrings)),
            );
            if (!(maxBatch > 0)) {
                services.messaging.sendGameMessage(player, "You can't string any bows right now.");
                return;
            }
            const options = buildBatchOptions(maxBatch);
            const dialogId = `fletch_string_${unstrungId}`;
            if (openDialogOptions && options.length > 0) {
                openDialogOptions(player, {
                    id: dialogId,
                    modal: true,
                    title: "How many would you like to string?",
                    options: options.map((opt) => opt.label),
                    onSelect: (idx) => {
                        const selected = options[idx];
                        if (!selected) {
                            services.messaging.sendGameMessage(
                                player,
                                "You decide not to string the bow.",
                            );
                            return;
                        }
                        closeDialog?.(player, dialogId);
                        const ok = enqueueFletchingAction(
                            services,
                            player,
                            recipe,
                            Math.max(1, Math.min(selected.count, maxBatch)),
                            undefined,
                        );
                        if (!ok) {
                            services.messaging.sendGameMessage(
                                player,
                                "You're too busy to fletch right now.",
                            );
                        }
                    },
                });
                return;
            }
            const ok = enqueueFletchingAction(services, player, recipe, maxBatch, tick);
            if (!ok) {
                services.messaging.sendGameMessage(player, "You're too busy to fletch right now.");
            }
        };
        registry.registerItemOnItem(unstrungId, secondaryItemId, handler);
    };

    const combineDialogTitle = (recipe: FletchingProductDefinition): string =>
        recipe.kind === "headless_arrow"
            ? "Attach feathers"
            : recipe.kind === "arrow"
              ? "Attach arrowtips"
              : recipe.kind === "arrowtips"
                ? "Carve arrowtips"
                : recipe.kind === "bolt_tips"
                  ? "Carve bolt tips"
                  : recipe.kind === "javelin_heads"
                    ? "Carve javelin heads"
                    : recipe.kind === "bolt"
                      ? "Attach bolt tips"
                      : recipe.kind === "javelin"
                        ? "Attach javelin heads"
                        : recipe.kind === "dart_tips"
                          ? "Carve dart tips"
                          : recipe.kind === "dart"
                            ? "Attach feathers"
                            : "How many would you like to make?";

    const openCombineBatch = (
        player: PlayerState,
        recipe: FletchingProductDefinition,
        maxBatch: number,
        tick?: number,
    ): void => {
        const options = buildBatchOptions(maxBatch);
        const dialogId = `fletch_combine_${recipe.id}`;
        if (openDialogOptions && options.length > 0) {
            openDialogOptions(player, {
                id: dialogId,
                modal: true,
                title: combineDialogTitle(recipe),
                options: options.map((option) => option.label),
                onSelect: (index) => {
                    const selected = options[index];
                    if (!selected) {
                        services.messaging.sendGameMessage(player, "You decide not to continue fletching.");
                        return;
                    }
                    closeDialog?.(player, dialogId);
                    const desired = Math.max(1, Math.min(selected.count, maxBatch));
                    if (!enqueueFletchingAction(services, player, recipe, desired)) {
                        services.messaging.sendGameMessage(player, "You're too busy to fletch right now.");
                    }
                },
            });
            return;
        }
        const fallback = options[options.length - 1]?.count ?? Math.min(maxBatch, 1);
        if (!enqueueFletchingAction(services, player, recipe, Math.max(1, fallback), tick)) {
            services.messaging.sendGameMessage(player, "You're too busy to fletch right now.");
        }
    };

    const registerCombineHandler = (recipes: readonly FletchingProductDefinition[]) => {
        const first = recipes[0];
        const secondaryId = first?.secondaryItemId;
        if (!first || !secondaryId) return;
        const handler = ({ player, source, target, tick }: ItemOnItemEvent) => {
            const sourceIsPrimary = source.itemId === first.inputItemId;
            const targetIsPrimary = target.itemId === first.inputItemId;
            if (!sourceIsPrimary && !targetIsPrimary) return;
            const other = sourceIsPrimary ? target : source;
            if (other.itemId !== secondaryId) return;
            const inventory = getInventoryItems(player);
            const primaryCount = countItemQuantity(inventory, first.inputItemId);
            if (primaryCount <= 0) {
                const label = first.primaryLabel ?? "the required items";
                services.messaging.sendGameMessage(player, `You need ${label} in your inventory.`);
                return;
            }
            const secondaryCount = countItemQuantity(inventory, secondaryId);
            if (secondaryCount <= 0) {
                const label = first.secondaryLabel ?? "the other ingredient";
                services.messaging.sendGameMessage(player, `You need ${label} to keep fletching.`);
                return;
            }
            const level = getEffectiveFletchingLevel(services, player);
            const choices = recipes.map((recipe) => {
                const secondaryCap = recipe.secondaryIsTool === true
                    ? Number.MAX_SAFE_INTEGER
                    : secondaryCount;
                const maxBatch = Math.max(0, Math.min(MAX_BATCH, primaryCount, secondaryCap));
                const levelMet = level >= recipe.level;
                return {
                    recipe,
                    maxBatch,
                    craftable: levelMet && maxBatch > 0,
                    label: levelMet
                        ? `${recipe.productName} (${maxBatch} ready)`
                        : `${recipe.productName} (Lvl ${recipe.level})`,
                };
            });
            if (choices.length > 1 && openDialogOptions) {
                const dialogId = `fletch_combine_${first.inputItemId}_${secondaryId}`;
                openDialogOptions(player, {
                    id: dialogId,
                    modal: true,
                    title: "What would you like to make?",
                    options: choices.map((choice) => choice.label),
                    disabledOptions: choices.map((choice) => !choice.craftable),
                    onSelect: (index) => {
                        const selected = choices[index];
                        if (!selected) {
                            services.messaging.sendGameMessage(player, "You decide not to continue fletching.");
                            return;
                        }
                        if (!selected.craftable) {
                            services.messaging.sendGameMessage(player, `You need Fletching level ${selected.recipe.level} for that.`);
                            return;
                        }
                        closeDialog?.(player, dialogId);
                        openCombineBatch(player, selected.recipe, selected.maxBatch, tick);
                    },
                });
                return;
            }
            const selected = choices.find((choice) => choice.craftable);
            if (!selected) {
                const requiredLevel = Math.min(...choices.map((choice) => choice.recipe.level));
                services.messaging.sendGameMessage(player, `You need Fletching level ${requiredLevel} to make anything from that.`);
                return;
            }
            openCombineBatch(player, selected.recipe, selected.maxBatch, tick);
        };
        registry.registerItemOnItem(first.inputItemId, secondaryId, handler);
    };

    for (const logId of FLETCHING_LOG_IDS) {
        registerHandler(logId);
    }
    for (const unstrungId of FLETCHING_STRING_IDS) {
        registerStringingHandler(unstrungId);
    }
    const combineGroups = new Map<string, FletchingProductDefinition[]>();
    for (const recipe of FLETCHING_COMBINE_RECIPES) {
        const secondaryId = recipe.secondaryItemId;
        if (!secondaryId) continue;
        const pair = [recipe.inputItemId, secondaryId].sort((a, b) => a - b).join("#");
        const group = combineGroups.get(pair) ?? [];
        group.push(recipe);
        combineGroups.set(pair, group);
    }
    for (const recipes of combineGroups.values()) registerCombineHandler(recipes);
}
