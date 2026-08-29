import type { PlayerState } from "@server/game/player";
import type { LocationService } from "@server/game/services/LocationService";
import type { InstanceGraveLocation } from "@server/game/state/PlayerInstanceGraveState";

export const INSTANCE_GRAVE_RECLAIM_LOC_ID = 9359;
export const INSTANCE_GRAVE_RECLAIM_TILE = Object.freeze({ x: 2858, y: 5354, level: 2 });
const DEFAULT_INSTANCE_GRAVE_LOCATION: InstanceGraveLocation = {
    locId: INSTANCE_GRAVE_RECLAIM_LOC_ID,
    // Preserve the legacy tile object for older graves and existing location
    // callers; LocationService only reads x/y while the historical level stays
    // available to code that treats this exported constant as a full location.
    tile: INSTANCE_GRAVE_RECLAIM_TILE,
    level: INSTANCE_GRAVE_RECLAIM_TILE.level,
};
/** One policy switch for future paid reclaim; zero preserves the current free flow. */
export const INSTANCE_GRAVE_RECLAIM_COST = 0;

const INSTANCE_GRAVE_LOC_SHAPE = 10;
const INSTANCE_GRAVE_LOC_ROTATION = 0;

type InstanceGraveLocationFacade = Pick<
    LocationService,
    "replaceTemporaryLoc" | "clearTemporaryLoc"
>;
type InstanceGraveLocationValidationFacade = Pick<
    LocationService,
    "hasTemporaryLocVisibleToPlayer"
>;

export interface InstanceGraveInteractionTarget {
    readonly locId: number;
    readonly tile: { x: number; y: number };
    readonly level: number;
}

/** Never trust the id/tile echoed by a loc-op packet as proof a grave exists. */
export function isAuthorizedInstanceGraveInteraction(
    location: InstanceGraveLocationValidationFacade,
    player: PlayerState,
    target: InstanceGraveInteractionTarget,
): boolean {
    const grave = player.instanceGrave?.getLocation() ?? DEFAULT_INSTANCE_GRAVE_LOCATION;
    return (
        target.locId === grave.locId &&
        target.tile.x === grave.tile.x &&
        target.tile.y === grave.tile.y &&
        target.level === grave.level &&
        location.hasTemporaryLocVisibleToPlayer(
            player,
            grave.locId,
            grave.tile,
            grave.level,
        )
    );
}

/**
 * Keep the reclaim gravestone aligned with the player's persistent storage.
 * The temporary location is owner-scoped: it is neither rendered nor
 * interactable for players who do not have items waiting for reclaim.
 */
export function syncInstanceGravePresentation(
    location: InstanceGraveLocationFacade,
    player: PlayerState,
): void {
    const scope = { worldViewId: -1, ownerPlayerId: player.id };
    const grave = player.instanceGrave.getLocation() ?? DEFAULT_INSTANCE_GRAVE_LOCATION;
    if (player.instanceGrave.hasItems()) {
        location.replaceTemporaryLoc(
            scope,
            0,
            grave.locId,
            grave.tile,
            grave.level,
            {
                newShape: INSTANCE_GRAVE_LOC_SHAPE,
                newRotation: INSTANCE_GRAVE_LOC_ROTATION,
            },
        );
        return;
    }

    location.clearTemporaryLoc(
        scope,
        0,
        grave.tile,
        grave.level,
        INSTANCE_GRAVE_LOC_SHAPE,
    );
}
