import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type { ScriptActionHandlerContext, ScriptServices } from "@server/game/scripts/types";
import {
    type InventoryOutputPlacement,
    type ItemAmount,
    applyInventoryTransform,
    hasInventoryItems,
    maxInventoryTransforms,
} from "@server/game/skilling/InventoryTransform";
import {
    type SkillActionPolicy,
    defineSkillAction,
    repeatSkillAction,
    requestSkillAction,
} from "@server/game/skilling/SkillAction";
import {
    type RequirementFailure,
    type SkillLevelSource,
    type ToolRequirement,
    checkSkillingRequirements,
} from "@server/game/skilling/Requirements";

export interface ProductionRecipePolicy<Source = unknown> {
    id: string;
    source: Source;
    level: number;
    /** Defaults to effective (base + boost); use base for explicitly unboostable recipes. */
    levelSource?: SkillLevelSource;
    inputs: readonly ItemAmount[];
    outputs: readonly ItemAmount[];
    tools?: readonly ToolRequirement[];
    xp: number;
    animationId?: number;
    ticks: number;
    outputPlacement?: InventoryOutputPlacement;
}

export interface ProductionMessages<Source> {
    unknownRecipe: string;
    missingLevel: (recipe: ProductionRecipePolicy<Source>) => string;
    missingInputs: (recipe: ProductionRecipePolicy<Source>) => string;
    missingTools: (recipe: ProductionRecipePolicy<Source>) => string;
    inventoryFull: (recipe: ProductionRecipePolicy<Source>) => string;
    /** Pure formatter evaluated before the inventory transaction commits. */
    success: (
        recipe: ProductionRecipePolicy<Source>,
        outcome: ProductionStepOutcome,
        context: ProductionStepContext<Source>,
    ) => string;
    interrupted: string;
}

export interface ProductionSkillDefinition<Source> {
    name: string;
    skillId: number;
    recipes: readonly ProductionRecipePolicy<Source>[];
    messages: ProductionMessages<Source>;
    /** Additional groups used only for the initial request (for legacy surface locks). */
    requestGroups?: readonly string[];
    /** Some legacy handlers deliberately report a handled failure as ok. */
    handledFailureIsOk?: boolean;
    /** Injectable for deterministic simulations/tests without changing recipe logic. */
    random?: () => number;
    /** Pure resolver for stochastic/conditional products before the atomic exchange. */
    resolveOutcome?: (context: ProductionStepContext<Source>) => ProductionStepOutcome;
    /**
     * Applies non-inventory state such as equipment charges after a committed
     * exchange. Exceptions are isolated because the inventory transaction can
     * no longer be rolled back safely at this point.
     */
    afterStep?: (
        context: ProductionStepContext<Source>,
        outcome: ProductionStepOutcome,
    ) => void;
    /**
     * Pure builder that preserves action-specific fields (heat source,
     * facility, etc.) across repeats. Evaluated before inventory commit.
     */
    buildRepeatData?: (
        context: ProductionStepContext<Source>,
        remaining: number,
        outcome: ProductionStepOutcome,
    ) => ProductionActionData & Record<string, unknown>;
}

export interface ProductionActionData {
    recipeId: string;
    count: number;
}

export interface ProductionStepContext<Source> {
    player: PlayerState;
    services: ScriptServices;
    tick: number;
    recipe: ProductionRecipePolicy<Source>;
    data: ProductionActionData & Record<string, unknown>;
    random: () => number;
}

export interface ProductionStepOutcome {
    /** Content-defined label for success/failure messaging and post-step effects. */
    variant?: string;
    inputs?: readonly ItemAmount[];
    outputs?: readonly ItemAmount[];
    outputPlacement?: InventoryOutputPlacement;
    xp?: number;
    animationId?: number;
    /** False supports valid failure products such as burnt food. */
    awardXp?: boolean;
    /** False prevents failure products from counting as crafted collection items. */
    emitCraftEvents?: boolean;
}

export interface DefinedProductionSkill<Source> {
    readonly actionKind: `skill.${string}`;
    getRecipe(id: string): ProductionRecipePolicy<Source> | undefined;
    canMake(services: ScriptServices, player: PlayerState, recipe: ProductionRecipePolicy<Source>): boolean;
    hasMaterials(
        services: ScriptServices,
        player: PlayerState,
        recipe: ProductionRecipePolicy<Source>,
    ): boolean;
    maxBatch(
        services: ScriptServices,
        player: PlayerState,
        recipe: ProductionRecipePolicy<Source>,
        limit?: number,
    ): number;
    request(
        services: ScriptServices,
        player: PlayerState,
        recipe: ProductionRecipePolicy<Source>,
        count: number,
        tick?: number,
        data?: Readonly<Record<string, unknown>>,
    ): boolean;
    execute(ctx: ScriptActionHandlerContext): ActionExecutionResult;
}

/**
 * Defines the common deterministic production lifecycle: requirements, atomic
 * inputs/outputs, animation, XP, craft event, repeat timing, and interruption.
 * Random outcome formulas and charged-equipment policy remain explicit injected callbacks.
 */
export function defineProductionSkill<Source>(
    definition: ProductionSkillDefinition<Source>,
): DefinedProductionSkill<Source> {
    if (typeof definition.name !== "string" || !definition.name.trim()) {
        throw new Error("A production skill requires a name.");
    }
    if (!Number.isInteger(definition.skillId) || definition.skillId < 0) {
        throw new Error("A production skill requires a valid skill id.");
    }
    const recipes = new Map<string, ProductionRecipePolicy<Source>>();
    const policies = new Map<string, SkillActionPolicy>();
    const requestPolicies = new Map<string, SkillActionPolicy>();
    for (const recipe of definition.recipes) {
        validateRecipe(recipe);
        if (recipes.has(recipe.id)) {
            throw new Error(`Duplicate production recipe id: ${recipe.id}`);
        }
        recipes.set(recipe.id, recipe);
        policies.set(
            recipe.id,
            defineSkillAction(definition.name, { delayTicks: Math.max(1, recipe.ticks) }),
        );
        requestPolicies.set(
            recipe.id,
            defineSkillAction(definition.name, {
                delayTicks: Math.max(1, recipe.ticks),
                groups: definition.requestGroups,
            }),
        );
    }
    const policyFor = (recipe: ProductionRecipePolicy<Source>): SkillActionPolicy =>
        policies.get(recipe.id)!;

    const requirementFailure = (
        services: ScriptServices,
        player: PlayerState,
        recipe: ProductionRecipePolicy<Source>,
    ): RequirementFailure | undefined =>
        checkSkillingRequirements(services, player, {
            levels: [
                {
                    skillId: definition.skillId,
                    level: recipe.level,
                    source: recipe.levelSource ?? "effective",
                },
            ],
            tools: recipe.tools,
        });

    const failure = (
        player: PlayerState,
        message: string,
        reason: string,
    ): ActionExecutionResult => ({
        ok: definition.handledFailureIsOk === true,
        reason,
        effects: message ? [{ type: "message", playerId: player.id, message }] : [],
    });

    return Object.freeze({
        actionKind: defineSkillAction(definition.name, { delayTicks: 1 }).kind,
        getRecipe: (id: string) => recipes.get(id),
        canMake(
            services: ScriptServices,
            player: PlayerState,
            recipe: ProductionRecipePolicy<Source>,
        ): boolean {
            return (
                requirementFailure(services, player, recipe) === undefined &&
                hasInventoryItems(services.inventory.getInventoryItems(player), recipe.inputs)
            );
        },
        hasMaterials(
            services: ScriptServices,
            player: PlayerState,
            recipe: ProductionRecipePolicy<Source>,
        ): boolean {
            return (
                checkSkillingRequirements(services, player, { tools: recipe.tools }) === undefined &&
                hasInventoryItems(services.inventory.getInventoryItems(player), recipe.inputs)
            );
        },
        maxBatch(
            services: ScriptServices,
            player: PlayerState,
            recipe: ProductionRecipePolicy<Source>,
            limit: number = 28,
        ): number {
            return maxInventoryTransforms(
                services.inventory.getInventoryItems(player),
                recipe.inputs,
                limit,
            );
        },
        request(
            services: ScriptServices,
            player: PlayerState,
            recipe: ProductionRecipePolicy<Source>,
            count: number,
            tick?: number,
            data: Readonly<Record<string, unknown>> = {},
        ): boolean {
            return requestSkillAction(
                services,
                player,
                requestPolicies.get(recipe.id)!,
                {
                    ...data,
                    recipeId: recipe.id,
                    count: Math.max(1, Math.trunc(count)),
                },
                tick,
            );
        },
        execute(ctx: ScriptActionHandlerContext): ActionExecutionResult {
            const { player, services, tick } = ctx;
            const data = ctx.data as ProductionActionData & Record<string, unknown>;
            const recipe = recipes.get(data.recipeId);
            if (!recipe) return failure(player, definition.messages.unknownRecipe, "unknown_recipe");

            const unmet = requirementFailure(services, player, recipe);
            if (unmet?.kind === "level") {
                return failure(player, definition.messages.missingLevel(recipe), "level");
            }
            if (unmet?.kind === "tool") {
                return failure(player, definition.messages.missingTools(recipe), "tool");
            }

            // Legacy production handlers validated their static materials before
            // rolling stochastic outcomes. Besides preserving message ordering,
            // this prevents failed attempts from advancing a deterministic RNG.
            if (
                !hasInventoryItems(
                    services.inventory.getInventoryItems(player),
                    recipe.inputs,
                )
            ) {
                return failure(player, definition.messages.missingInputs(recipe), "materials");
            }

            const stepContext: ProductionStepContext<Source> = {
                player,
                services,
                tick,
                recipe,
                data,
                random: definition.random ?? Math.random,
            };
            const remaining = Math.max(0, Math.trunc(data.count) - 1);
            const action = policyFor(recipe);
            let outcome: ProductionStepOutcome;
            let successMessage: string;
            let repeatData: unknown;
            try {
                // These content callbacks are planning/formatting only. Resolve
                // them before mutation so a bad content extension cannot strand
                // a committed inventory without its snapshot response.
                outcome = definition.resolveOutcome?.(stepContext) ?? {};
                successMessage = definition.messages.success(recipe, outcome, stepContext);
                if (remaining > 0) {
                    repeatData = definition.buildRepeatData?.(stepContext, remaining, outcome) ?? {
                        recipeId: recipe.id,
                        count: remaining,
                    };
                }
            } catch (error) {
                reportCallbackFailure(services, definition.name, recipe.id, "planning", error);
                return failure(player, "", "callback_failed");
            }
            const inputs = outcome.inputs ?? recipe.inputs;
            const outputs = outcome.outputs ?? recipe.outputs;
            const exchange = applyInventoryTransform(services.inventory, player, {
                inputs,
                outputs,
                outputPlacement: outcome.outputPlacement ?? recipe.outputPlacement,
            });
            if (!exchange.ok) {
                return failure(
                    player,
                    exchange.reason === "inventory-full"
                        ? definition.messages.inventoryFull(recipe)
                        : definition.messages.missingInputs(recipe),
                    exchange.reason === "inventory-full"
                        ? "inventory_full"
                        : exchange.reason === "invalid-transform"
                          ? "invalid_recipe"
                          : "materials",
                );
            }

            const animationId = outcome.animationId ?? recipe.animationId;
            if (animationId !== undefined && animationId >= 0) {
                services.animation.playPlayerSeq(player, animationId);
            }
            if (outcome.awardXp !== false) {
                services.skills.addSkillXp(player, definition.skillId, outcome.xp ?? recipe.xp);
            }
            if (outcome.emitCraftEvents !== false) {
                for (const output of outputs) {
                    services.system.eventBus?.emit("item:craft", {
                        playerId: player.id,
                        itemId: output.itemId,
                        count: output.quantity,
                    });
                }
            }
            try {
                definition.afterStep?.(stepContext, outcome);
            } catch (error) {
                // Inventory has committed and is deliberately not replayed or
                // rolled back. Continue to the single repeat scheduling point
                // below so the caller always receives the authoritative snapshot.
                reportCallbackFailure(services, definition.name, recipe.id, "afterStep", error);
            }

            const effects: ActionEffect[] = [{ type: "inventorySnapshot", playerId: player.id }];
            if (successMessage) {
                effects.push({ type: "message", playerId: player.id, message: successMessage });
            }

            if (
                remaining > 0 &&
                !repeatSkillAction(
                    services,
                    player,
                    action,
                    repeatData,
                    tick,
                )
            ) {
                if (!definition.messages.interrupted) {
                    return {
                        ok: true,
                        cooldownTicks: action.cooldownTicks,
                        groups: [...action.groups],
                        effects,
                    };
                }
                effects.push({
                    type: "message",
                    playerId: player.id,
                    message: definition.messages.interrupted,
                });
            }

            return {
                ok: true,
                cooldownTicks: action.cooldownTicks,
                groups: [...action.groups],
                effects,
            };
        },
    });
}

function reportCallbackFailure(
    services: ScriptServices,
    skillName: string,
    recipeId: string,
    phase: "planning" | "afterStep",
    error: unknown,
): void {
    try {
        services.system?.logger?.warn?.(
            `[skilling] ${skillName} recipe '${recipeId}' ${phase} callback failed`,
            error,
        );
    } catch {
        // Error reporting must not turn an isolated content failure into a tick failure.
    }
}

function validateRecipe<Source>(recipe: ProductionRecipePolicy<Source>): void {
    if (!recipe.id.trim()) throw new Error("A production recipe requires an id.");
    if (!Number.isInteger(recipe.level) || recipe.level < 1) {
        throw new Error(`Production recipe ${recipe.id} has an invalid level.`);
    }
    if (!Number.isFinite(recipe.xp) || recipe.xp < 0) {
        throw new Error(`Production recipe ${recipe.id} has invalid XP.`);
    }
    if (!Number.isInteger(recipe.ticks) || recipe.ticks < 1) {
        throw new Error(`Production recipe ${recipe.id} has invalid timing.`);
    }
    if (recipe.inputs.length === 0 || !validAmounts(recipe.inputs) || !validAmounts(recipe.outputs)) {
        throw new Error(`Production recipe ${recipe.id} has invalid item amounts.`);
    }
    for (const tool of recipe.tools ?? []) {
        if (
            tool.itemIds.length === 0 ||
            tool.itemIds.some((itemId) => !Number.isInteger(itemId) || itemId <= 0) ||
            (tool.quantity !== undefined &&
                (!Number.isInteger(tool.quantity) || tool.quantity <= 0))
        ) {
            throw new Error(`Production recipe ${recipe.id} has an invalid tool requirement.`);
        }
    }
}

function validAmounts(amounts: readonly ItemAmount[]): boolean {
    return amounts.every(
        ({ itemId, quantity }) =>
            Number.isInteger(itemId) &&
            itemId > 0 &&
            Number.isInteger(quantity) &&
            quantity > 0,
    );
}
