import type { PlayerState } from "../player";
import type { LocationService } from "../services/LocationService";

export const INSTANCE_GRAVE_RECLAIM_LOC_ID = 9359;
export const INSTANCE_GRAVE_RECLAIM_TILE = Object.freeze({ x: 2858, y: 5354, level: 2 });
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
    return (
        target.locId === INSTANCE_GRAVE_RECLAIM_LOC_ID &&
        target.tile.x === INSTANCE_GRAVE_RECLAIM_TILE.x &&
        target.tile.y === INSTANCE_GRAVE_RECLAIM_TILE.y &&
        target.level === INSTANCE_GRAVE_RECLAIM_TILE.level &&
        location.hasTemporaryLocVisibleToPlayer(
            player,
            INSTANCE_GRAVE_RECLAIM_LOC_ID,
            INSTANCE_GRAVE_RECLAIM_TILE,
            INSTANCE_GRAVE_RECLAIM_TILE.level,
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
    if (player.instanceGrave.hasItems()) {
        location.replaceTemporaryLoc(
            scope,
            0,
            INSTANCE_GRAVE_RECLAIM_LOC_ID,
            INSTANCE_GRAVE_RECLAIM_TILE,
            INSTANCE_GRAVE_RECLAIM_TILE.level,
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
        INSTANCE_GRAVE_RECLAIM_TILE,
        INSTANCE_GRAVE_RECLAIM_TILE.level,
        INSTANCE_GRAVE_LOC_SHAPE,
    );
}
