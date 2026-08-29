/**
 * Wizard Tower basement ladder (LostCity wizards_tower_laddertop).
 */
import { fromZone } from "@server/content/gamemodes/vanilla/scripts/content/traversal/coords";
import type { TraversalOverride } from "@server/content/gamemodes/vanilla/scripts/content/traversal/types";

export const WIZARD_TOWER_OVERRIDES: readonly TraversalOverride[] = [
    {
        from: fromZone(0, 48, 49, 32, 26),
        to: fromZone(0, 48, 149, 32, 40),
        action: "climb-down",
        animate: true,
        note: "Wizard Tower ground → basement",
    },
];
