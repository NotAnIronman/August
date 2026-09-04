import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { countInventoryItem } from "@server/game/skilling/InventoryTransform";

export type SkillLevelSource = "base" | "effective";
export type ToolSource = "inventory" | "equipment" | "carried";

export interface SkillLevelRequirement {
    skillId: number;
    level: number;
    source?: SkillLevelSource;
}

export interface ToolRequirement {
    /** Candidate IDs. `any` is useful for tool tiers; `all` for mould/tool sets. */
    itemIds: readonly number[];
    match?: "any" | "all";
    quantity?: number;
    source?: ToolSource;
}

export interface SkillingRequirements {
    levels?: readonly SkillLevelRequirement[];
    tools?: readonly ToolRequirement[];
}

export type RequirementFailure =
    | { kind: "level"; requirement: SkillLevelRequirement; actualLevel: number }
    | { kind: "tool"; requirement: ToolRequirement };

export function getSkillLevel(
    services: ScriptServices,
    player: PlayerState,
    skillId: number,
    source: SkillLevelSource = "effective",
): number {
    const skill = services.skills.getSkill(player, skillId);
    const storedBase = Math.trunc(skill?.baseLevel ?? 1);
    const storedBoost = Math.trunc(skill?.boost ?? 0);
    const base = Number.isFinite(storedBase) ? Math.max(1, storedBase) : 1;
    const boost = Number.isFinite(storedBoost) ? storedBoost : 0;
    return source === "base" ? base : Math.max(1, base + boost);
}

export function checkSkillingRequirements(
    services: ScriptServices,
    player: PlayerState,
    requirements: SkillingRequirements,
): RequirementFailure | undefined {
    for (const requirement of requirements.levels ?? []) {
        if (
            !Number.isInteger(requirement.skillId) ||
            requirement.skillId < 0 ||
            !Number.isInteger(requirement.level) ||
            requirement.level < 1
        ) {
            return { kind: "level", requirement, actualLevel: 0 };
        }
        const actualLevel = getSkillLevel(
            services,
            player,
            requirement.skillId,
            requirement.source,
        );
        if (actualLevel < Math.max(1, Math.trunc(requirement.level))) {
            return { kind: "level", requirement, actualLevel };
        }
    }
    for (const requirement of requirements.tools ?? []) {
        if (!hasTool(services, player, requirement)) {
            return { kind: "tool", requirement };
        }
    }
    return undefined;
}

export function hasTool(
    services: ScriptServices,
    player: PlayerState,
    requirement: ToolRequirement,
): boolean {
    const candidates = requirement.itemIds.filter(
        (itemId) => Number.isInteger(itemId) && itemId > 0,
    );
    if (candidates.length === 0) return false;
    const requestedQuantity = requirement.quantity ?? 1;
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) return false;
    const quantity = requestedQuantity;
    const source = requirement.source ?? "carried";
    const entries = services.inventory.getInventoryItems(player);
    const equipment = services.equipment.getEquipArray(player);
    const count = (itemId: number): number => {
        const inventoryQuantity =
            source === "equipment" ? 0 : countInventoryItem(entries, itemId);
        const equippedQuantity =
            source === "inventory"
                ? 0
                : equipment.reduce(
                      (total, equippedId) => total + (equippedId === itemId ? 1 : 0),
                      0,
                  );
        return inventoryQuantity + equippedQuantity;
    };
    const predicate = (itemId: number) => count(itemId) >= quantity;
    return requirement.match === "all" ? candidates.every(predicate) : candidates.some(predicate);
}
