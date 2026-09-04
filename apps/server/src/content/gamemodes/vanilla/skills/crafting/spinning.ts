import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import {
    ANY_ITEM_ID,
    ANY_LOC_ID,
    type IScriptRegistry,
    type LocInteractionEvent,
    type ScriptActionHandlerContext,
    type ScriptInventoryEntry,
    type ScriptServices,
} from "@server/game/scripts/types";
import { applyInventoryTransform } from "@server/game/skilling/InventoryTransform";
import {
    type SkillActionPolicy,
    defineSkillAction,
    repeatSkillAction,
    requestSkillAction,
    skillActionResult,
} from "@server/game/skilling/SkillAction";
import {
    SINEW_ANIMATION_ID,
    SINEW_CRAFT_XP,
    SINEW_DELAY_TICKS,
    SINEW_ITEM_ID,
    SINEW_SOURCE_ITEM_IDS,
    SPINNING_RECIPES,
    SPINNING_SOUND_ID,
    SPINNING_WHEEL_ANIMATION_ID,
    SPINNING_WHEEL_DEFAULT_ROTATION,
    SPINNING_WHEEL_LOC_IDS,
    SPINNING_WHEEL_SHAPE,
    type SpinningRecipe,
    getSpinningRecipeById,
    isSinewSourceItem,
} from "@server/content/gamemodes/vanilla/skills/crafting/spinningData";

const MAX_BATCH = 28;
const SPIN_ACTION = "spin";

const SPIN_ACTIONS = new Map<string, SkillActionPolicy>(
    SPINNING_RECIPES.map((recipe) => [
        recipe.id,
        defineSkillAction("spin", { delayTicks: recipe.delayTicks }),
    ]),
);
const SINEW_ACTION = defineSkillAction("sinew", { delayTicks: SINEW_DELAY_TICKS });

type InventoryEntry = ScriptInventoryEntry;
type CraftableChoice = {
    recipe: SpinningRecipe;
    batch: number;
    levelMet: boolean;
};

type SpinVisualTarget = {
    locId: number;
    tile: { x: number; y: number };
    level: number;
    shape?: number;
    rotation?: number;
};

const countItem = (entries: InventoryEntry[], itemId: number): number => {
    let total = 0;
    for (const entry of entries) {
        if (entry.itemId === itemId) {
            total += Math.max(0, entry.quantity);
        }
    }
    return total;
};

const computeBatchCount = (entries: InventoryEntry[], recipe: SpinningRecipe): number => {
    const total = countItem(entries, recipe.inputItemId);
    const perSpin = Math.max(1, recipe.inputQuantity);
    if (!(total > 0 && perSpin > 0)) return 0;
    return Math.max(0, Math.min(MAX_BATCH, Math.floor(total / perSpin)));
};

const formatProductLabel = (recipe: SpinningRecipe): string => {
    if (!recipe.name) return "";
    return recipe.name.charAt(0).toUpperCase() + recipe.name.slice(1);
};

const enqueueSpinAction = (
    services: ScriptServices,
    player: PlayerState,
    recipe: SpinningRecipe,
    desiredCount: number,
    visualTarget?: SpinVisualTarget,
    tick?: number,
): boolean => {
    const action = SPIN_ACTIONS.get(recipe.id);
    if (!action) return false;
    return requestSkillAction(
        services,
        player,
        action,
        {
            recipeId: recipe.id,
            count: Math.max(1, desiredCount),
            target: visualTarget,
        },
        tick,
    );
};

// ---------------------------------------------------------------------------
// Spin action data
// ---------------------------------------------------------------------------

interface SpinActionData {
    recipeId: string;
    count: number;
    target?: SpinVisualTarget;
}

interface SinewActionData {
    itemId: number;
    slot?: number;
    locId?: number;
    tile?: { x: number; y: number };
    level?: number;
}

function buildMessageEffect(player: PlayerState, message: string): ActionEffect {
    return { type: "message", playerId: player.id, message };
}

function playSpinVisuals(
    services: ScriptServices,
    player: PlayerState,
    recipe: SpinningRecipe,
    target?: SpinVisualTarget,
): void {
    services.animation.playPlayerSeq(player, recipe.animation);
    if (target) {
        services.location.faceTile(player, target.tile);
        services.animation.playLocAnimation({
            playerId: player.id,
            locId: target.locId,
            tile: target.tile,
            level: target.level,
            shape: target.shape ?? SPINNING_WHEEL_SHAPE,
            rotation: target.rotation ?? SPINNING_WHEEL_DEFAULT_ROTATION,
            animId: SPINNING_WHEEL_ANIMATION_ID,
        });
    }
    services.sound.sendSound(player, SPINNING_SOUND_ID);
}

function executeSpinAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, tick, services } = ctx;
    const data = ctx.data as SpinActionData;
    const recipeId = data.recipeId;
    const recipe = getSpinningRecipeById(recipeId);
    if (!recipe) {
        return { ok: true, effects: [buildMessageEffect(player, "You can't spin that.")] };
    }
    const action = SPIN_ACTIONS.get(recipe.id);
    if (!action) {
        return { ok: true, effects: [buildMessageEffect(player, "You can't spin that.")] };
    }

    const skill = services.skills.getSkill(player, SkillId.Crafting);
    if ((skill?.baseLevel ?? 1) < recipe.level) {
        return {
            ok: true,
            effects: [
                buildMessageEffect(
                    player,
                    `You need Crafting level ${recipe.level} to spin ${recipe.name}.`,
                ),
            ],
        };
    }

    const totalCount = Math.max(1, data.count);
    const requiredPerSpin = Math.max(1, recipe.inputQuantity);
    const productQuantity = Math.max(1, recipe.outputQuantity);
    const exchange = applyInventoryTransform(services.inventory, player, {
        inputs: [{ itemId: recipe.inputItemId, quantity: requiredPerSpin }],
        outputs: [{ itemId: recipe.productItemId, quantity: productQuantity }],
        outputPlacement: "first-consumed-slot",
    });
    if (!exchange.ok) {
        return {
            ok: true,
            effects: [
                buildMessageEffect(
                    player,
                    exchange.reason === "inventory-full"
                        ? "You need more inventory space to keep spinning."
                        : `You need more ${recipe.inputName} to keep spinning.`,
                ),
            ],
        };
    }

    services.skills.addSkillXp(player, SkillId.Crafting, recipe.xp);
    services.system.eventBus?.emit("item:craft", {
        playerId: player.id,
        itemId: recipe.productItemId,
        count: 1,
    });

    const effects: ActionEffect[] = [{ type: "inventorySnapshot", playerId: player.id }];

    const remaining = Math.max(0, totalCount - 1);

    if (remaining > 0) {
        const rescheduled = repeatSkillAction(
            services,
            player,
            action,
            { recipeId: recipe.id, count: remaining, target: data.target },
            tick,
        );
        if (!rescheduled) {
            effects.push(
                buildMessageEffect(player, "You stop spinning because you're already busy."),
            );
        } else {
            playSpinVisuals(services, player, recipe, data.target);
        }
    }

    return skillActionResult(action, effects);
}

function executeSinewAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, services } = ctx;
    const data = ctx.data as SinewActionData;
    const sourceItemId = data.itemId;

    if (!isSinewSourceItem(sourceItemId)) {
        return {
            ok: true,
            effects: [buildMessageEffect(player, "You can't turn that into sinew.")],
        };
    }

    let slot = data.slot;
    if (slot === undefined) {
        slot = services.inventory.findInventorySlotWithItem(player, sourceItemId);
    }

    const slotEntry =
        slot === undefined ? undefined : services.inventory.getInventoryItems(player)[slot];
    if (!slotEntry || slotEntry.itemId !== sourceItemId || slotEntry.quantity <= 0) {
        return {
            ok: true,
            effects: [buildMessageEffect(player, "You need raw meat to dry into sinew.")],
        };
    }

    const exchange = applyInventoryTransform(services.inventory, player, {
        inputs: [{ itemId: sourceItemId, quantity: 1, slot }],
        outputs: [{ itemId: SINEW_ITEM_ID, quantity: 1 }],
        outputPlacement: "first-consumed-slot",
    });
    if (!exchange.ok) {
        return {
            ok: true,
            effects: [buildMessageEffect(player, "You need raw meat to dry into sinew.")],
        };
    }
    services.animation.playPlayerSeq(player, SINEW_ANIMATION_ID);
    services.skills.addSkillXp(player, SkillId.Crafting, SINEW_CRAFT_XP);
    services.system.eventBus?.emit("item:craft", {
        playerId: player.id,
        itemId: SINEW_ITEM_ID,
        count: 1,
    });

    const effects: ActionEffect[] = [
        { type: "inventorySnapshot", playerId: player.id },
        buildMessageEffect(player, "You dry the meat into sinew."),
    ];

    return skillActionResult(SINEW_ACTION, effects);
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerActionHandler("skill.spin", executeSpinAction);
    registry.registerActionHandler("skill.sinew", executeSinewAction);

    const getInventoryItems = services.inventory.getInventoryItems;

    const handleSpinRequest = ({
        player,
        target,
    }: {
        player: PlayerState;
        target?: SpinVisualTarget;
    }) => {
        const inventory = getInventoryItems(player);
        const level = services.skills.getSkill(player, SkillId.Crafting)?.baseLevel ?? 1;

        const choices: CraftableChoice[] = SPINNING_RECIPES.map((recipe) => {
            const batch = computeBatchCount(inventory as InventoryEntry[], recipe);
            const levelMet = level >= recipe.level;
            return {
                recipe,
                batch,
                levelMet,
            };
        }).filter((choice) => choice.batch > 0);

        if (choices.length === 0) {
            services.messaging.sendGameMessage(
                player,
                "You need something like wool, flax, sinew, or roots to spin.",
            );
            return;
        }

        const craftableChoices = choices.filter((choice) => choice.levelMet && choice.batch > 0);
        if (craftableChoices.length === 0) {
            const lowestReq = choices.reduce((prev, curr) =>
                curr.recipe.level < prev.recipe.level ? curr : prev,
            );
            services.messaging.sendGameMessage(
                player,
                `You need Crafting level ${lowestReq.recipe.level} to spin ${lowestReq.recipe.name}.`,
            );
            return;
        }

        if (target) {
            services.location.faceTile(player, target.tile);
        }

        const maxQuantity = Math.max(...craftableChoices.map((choice) => choice.batch));
        services.dialog.openSkillMulti(player, {
            id: `spin_skillmulti_${player.id}`,
            title: "How many would you like to spin?",
            products: craftableChoices.map((choice) => ({
                itemId: choice.recipe.productItemId,
                label: formatProductLabel(choice.recipe),
                maxQuantity: choice.batch,
            })),
            maxQuantity,
            defaultQuantity: 1,
            onSelect: (index, quantity) => {
                const selected = craftableChoices[index];
                if (!selected) {
                    services.messaging.sendGameMessage(player, "You decide not to spin anything.");
                    return;
                }
                const desiredCount = Math.max(1, Math.min(selected.batch, quantity | 0));
                const ok = enqueueSpinAction(
                    services,
                    player,
                    selected.recipe,
                    desiredCount,
                    target,
                );
                if (!ok) {
                    services.messaging.sendGameMessage(
                        player,
                        "You're too busy to spin anything right now.",
                    );
                    return;
                }
                playSpinVisuals(services, player, selected.recipe, target);
            },
        });
    };

    const buildSpinTarget = (
        locId: number,
        tile: { x: number; y: number },
        level: number,
    ): SpinVisualTarget => ({
        locId,
        tile: { x: tile.x, y: tile.y },
        level,
        shape: SPINNING_WHEEL_SHAPE,
        rotation: SPINNING_WHEEL_DEFAULT_ROTATION,
    });

    const handler = (event: LocInteractionEvent) =>
        handleSpinRequest({
            player: event.player,
            target: buildSpinTarget(event.locId, event.tile, event.level),
        });

    for (const locId of SPINNING_WHEEL_LOC_IDS) {
        registry.registerLocInteraction(locId, handler, SPIN_ACTION);
        registry.registerItemOnLoc(ANY_ITEM_ID, locId, (event) => {
            handleSpinRequest({
                player: event.player,
                target: buildSpinTarget(event.target.locId, event.target.tile, event.target.level),
            });
        });
    }

    for (const sourceItemId of SINEW_SOURCE_ITEM_IDS) {
        registry.registerItemOnLoc(sourceItemId, ANY_LOC_ID, (event) => {
            const locId = event.target.locId;
            const locDef = services.data.getLocDefinition(locId);
            if (!locDef) return;
            const name = locDef.name?.toLowerCase() ?? "";
            if (
                !name.includes("range") &&
                !name.includes("stove") &&
                !name.includes("cook") &&
                !name.includes("kitchen")
            )
                return;
            if (name.includes("fire")) return;
            const player = event.player;
            const tile = event.target.tile;
            const level = event.target.level;
            const requested = requestSkillAction(
                services,
                player,
                SINEW_ACTION,
                {
                    slot: event.source.slot,
                    itemId: event.source.itemId,
                    locId,
                    tile,
                    level,
                },
                event.tick,
            );
            if (!requested) {
                services.messaging.sendGameMessage(player, "You're too busy to do that right now.");
                return;
            }
            services.messaging.sendGameMessage(player, "You start drying the meat into sinew.");
        });
    }
}
