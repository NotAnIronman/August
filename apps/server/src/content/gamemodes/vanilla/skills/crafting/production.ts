import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import { ANY_LOC_ID, type IScriptRegistry, type ScriptActionHandlerContext, type ScriptServices } from "@server/game/scripts/types";
import { ALL_CRAFTING_RECIPES, GEM_RECIPES, GLASS_RECIPES, JEWELLERY_RECIPES, LEATHER_RECIPES, SILVER_RECIPES, type CraftingRecipe } from "@server/content/gamemodes/vanilla/skills/crafting/productionData";

type CraftData = { recipeId: string; count: number };
const count = (player: PlayerState, services: ScriptServices, itemId: number): number => services.inventory.getInventoryItems(player).filter((i) => i.itemId === itemId).reduce((n, i) => n + Math.max(0, i.quantity), 0);
const effectiveLevel = (player: PlayerState): number => { const skill = player.skillSystem.getSkill(SkillId.Crafting); return Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0)); };
const recipeById = (id: string): CraftingRecipe | undefined => ALL_CRAFTING_RECIPES.find((r) => r.id === id);
const canMake = (player: PlayerState, services: ScriptServices, recipe: CraftingRecipe): boolean => recipe.inputs.every((input) => count(player, services, input.itemId) >= input.quantity) && (!recipe.toolItemIds || recipe.toolItemIds.every((id) => count(player, services, id) > 0));
const maxBatch = (player: PlayerState, services: ScriptServices, recipe: CraftingRecipe): number => Math.max(0, Math.min(28, ...recipe.inputs.map((input) => Math.floor(count(player, services, input.itemId) / input.quantity))));

function enqueue(player: PlayerState, services: ScriptServices, recipe: CraftingRecipe, amount: number): boolean {
    return services.combat.requestAction(player, { kind: "skill.craft", data: { recipeId: recipe.id, count: amount }, delayTicks: recipe.delayTicks ?? 3, cooldownTicks: recipe.delayTicks ?? 3, groups: ["skill.craft"] }, services.system.getCurrentTick()).ok;
}

function execute(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, services, tick } = ctx; const data = ctx.data as CraftData; const recipe = recipeById(data.recipeId);
    if (!recipe) return { ok: false, reason: "unknown_recipe" };
    if (effectiveLevel(player) < recipe.level) return { ok: false, reason: "level", effects: [{ type: "message", playerId: player.id, message: `You need Crafting level ${recipe.level} to make that.` }] };
    if (!canMake(player, services, recipe)) return { ok: false, reason: "materials", effects: [{ type: "message", playerId: player.id, message: "You no longer have the materials or tools to make that." }] };
    const removed = new Map<number, number>();
    for (const input of recipe.inputs) for (let n = 0; n < input.quantity; n++) { const slot = services.inventory.findInventorySlotWithItem(player, input.itemId); if (slot === undefined || !services.inventory.consumeItem(player, slot)) return { ok: false, reason: "materials" }; removed.set(slot, (removed.get(slot) ?? 0) + 1); }
    const first = removed.keys().next().value as number | undefined;
    if (first === undefined) return { ok: false, reason: "materials" };
    services.inventory.setInventorySlot(player, first, recipe.outputItemId, recipe.outputQuantity ?? 1);
    services.animation.playPlayerSeq(player, recipe.animation ?? 884); services.skills.addSkillXp(player, SkillId.Crafting, recipe.xp);
    services.system.eventBus?.emit("item:craft", { playerId: player.id, itemId: recipe.outputItemId, count: recipe.outputQuantity ?? 1 });
    const remaining = Math.max(0, data.count - 1); if (remaining > 0) services.combat.scheduleAction(player.id, { kind: "skill.craft", data: { recipeId: recipe.id, count: remaining }, delayTicks: recipe.delayTicks ?? 3, cooldownTicks: recipe.delayTicks ?? 3, groups: ["skill.craft"] }, tick);
    return { ok: true, cooldownTicks: recipe.delayTicks ?? 3, groups: ["skill.craft"], effects: [{ type: "inventorySnapshot", playerId: player.id }] };
}

function open(player: PlayerState, services: ScriptServices, recipes: readonly CraftingRecipe[], title: string): void {
    const available = recipes.filter((recipe) => canMake(player, services, recipe));
    if (!available.length) { services.messaging.sendGameMessage(player, "You don't have the materials needed to make anything."); return; }
    services.dialog.openSkillMulti(player, { id: `craft_${player.id}`, title, products: available.map((recipe) => ({ itemId: recipe.outputItemId, label: recipe.name, maxQuantity: maxBatch(player, services, recipe) })), maxQuantity: Math.max(...available.map((r) => maxBatch(player, services, r))), defaultQuantity: 1, onSelect: (index, quantity) => { const recipe = available[index]; if (!recipe) return; if (effectiveLevel(player) < recipe.level) { services.messaging.sendGameMessage(player, `You need Crafting level ${recipe.level} to make that.`); return; } if (!enqueue(player, services, recipe, Math.max(1, Math.min(maxBatch(player, services, recipe), quantity | 0)))) services.messaging.sendGameMessage(player, "You're too busy to craft right now."); } });
}

export function registerCraftingProduction(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerActionHandler("skill.craft", execute);
    for (const recipe of GEM_RECIPES) registry.registerItemOnItem(recipe.inputs[0].itemId, 1755, (event) => open(event.player, services, [recipe], "Cut gem"));
    for (const hide of new Set(LEATHER_RECIPES.map((r) => r.inputs[0].itemId))) registry.registerItemOnItem(hide, 1733, (event) => open(event.player, services, LEATHER_RECIPES.filter((r) => r.inputs[0].itemId === hide), "What would you like to make?"));
    registry.registerItemOnLoc(2357, ANY_LOC_ID, (event) => { const actions = services.data.getLocDefinition(event.target.locId)?.actions ?? []; if (actions.some((a: string) => a?.toLowerCase() === "smelt")) open(event.player, services, JEWELLERY_RECIPES, "What would you like to make?"); });
    registry.registerItemOnLoc(2355, ANY_LOC_ID, (event) => { const actions = services.data.getLocDefinition(event.target.locId)?.actions ?? []; if (actions.some((a: string) => a?.toLowerCase() === "smelt")) open(event.player, services, SILVER_RECIPES, "What would you like to make?"); });
    registry.registerItemOnLoc(1783, ANY_LOC_ID, (event) => { const actions = services.data.getLocDefinition(event.target.locId)?.actions ?? []; if (actions.some((a: string) => a?.toLowerCase() === "smelt")) open(event.player, services, [GLASS_RECIPES[0]], "Make molten glass"); });
    registry.registerItemOnItem(1775, 1785, (event) => open(event.player, services, GLASS_RECIPES.slice(1), "What would you like to make?"));
}
