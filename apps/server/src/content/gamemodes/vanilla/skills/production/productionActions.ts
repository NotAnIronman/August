import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type { ScriptInventoryEntry, ScriptServices } from "@server/game/scripts/types";
import type { CookingHeatSource } from "@server/content/gamemodes/vanilla/skills/production/cookingData";

export type SkillSurfaceKind = "smith" | "cook" | "tan" | "smelt";

export type InventoryEntry = ScriptInventoryEntry;
export type SkillDialogChoice<T> = {
    recipe: T;
    label: string;
    craftable: boolean;
    batch: number;
};

export const MAX_BATCH = 28;
export const MAX_DIALOG_OPTIONS = 5;

export const SKILL_DIALOG_META: Record<SkillSurfaceKind, { id: string; title: string }> = {
    smith: { id: "skill.smith", title: "What would you like to smith?" },
    cook: { id: "skill.cook", title: "What would you like to cook?" },
    tan: { id: "skill.tan", title: "Which hide would you like to tan?" },
    smelt: { id: "skill.smelt", title: "Which bar would you like to smelt?" },
};

export function buildMessageEffect(player: PlayerState, message: string): ActionEffect {
    return { type: "message", playerId: player.id, message };
}

export function buildSkillFailure(
    player: PlayerState,
    message: string,
    reason: string,
): ActionExecutionResult {
    return { ok: false, reason, effects: [buildMessageEffect(player, message)] };
}

export const clampBatchCount = (count: number): number => Math.max(0, Math.min(MAX_BATCH, count));

export const countItem = (entries: InventoryEntry[], itemId: number): number => {
    let total = 0;
    for (const entry of entries) {
        if (entry.itemId === itemId) total += Math.max(0, entry.quantity);
    }
    return total;
};

export const hasItem = (
    entries: InventoryEntry[],
    itemId: number,
    quantity: number = 1,
): boolean => {
    if (!(itemId > 0)) return false;
    let remaining = quantity;
    for (const entry of entries) {
        if (entry.itemId === itemId && entry.quantity > 0) {
            remaining -= Math.min(entry.quantity, remaining);
            if (remaining <= 0) return true;
        }
    }
    return false;
};

export const getInventory = (services: ScriptServices, player: PlayerState): InventoryEntry[] =>
    services.inventory.getInventoryItems(player);

export const resolveCookingHeatSource = (
    services: ScriptServices,
    locId?: number,
): CookingHeatSource => {
    if (locId === undefined || !(locId > 0)) return "range";
    const definition = services.data.getLocDefinition(locId);
    const supportItems = definition?.supportItems ?? 1;
    const name = definition?.name?.toLowerCase() ?? "";
    if (supportItems <= 0 || name === "fire") return "fire";
    return "range";
};
