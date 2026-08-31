import type { LocInteractionEvent } from "@server/game/scripts/types";
import type { TilePos } from "@server/content/gamemodes/vanilla/scripts/content/traversal/coords";

export type TraversalOverride = {
    /** Absolute tile of the loc click (LostCity converted). */
    from: TilePos;
    /** Absolute destination tile. */
    to: TilePos;
    /** climb-up | climb-down | enter — matched loosely to loc option. */
    action: "climb-up" | "climb-down" | "enter" | "open";
    /** Optional game message after teleport. */
    message?: string;
    /** Use climb anim (default true). Instant teleports set false. */
    animate?: boolean;
    note?: string;
};

export type LocTraversalHandler = (event: LocInteractionEvent) => void;
