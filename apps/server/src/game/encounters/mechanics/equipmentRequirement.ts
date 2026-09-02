import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

export interface EquipmentRequirement {
    readonly itemId: number;
    readonly location?: "inventory" | "equipped" | "either";
}

/** Shared predicate for encounter entry and damage-safety equipment checks. */
export function hasEquipmentRequirements(
    player: PlayerState,
    services: ScriptServices,
    requirements: readonly EquipmentRequirement[],
): boolean {
    const equipped = services.equipment.getEquipArray(player);
    return requirements.every((requirement) => {
        const location = requirement.location ?? "either";
        const inInventory = location !== "equipped" && services.inventory.playerHasItem(player, requirement.itemId);
        const isEquipped = location !== "inventory" && equipped.includes(requirement.itemId);
        return inInventory || isEquipped;
    });
}
