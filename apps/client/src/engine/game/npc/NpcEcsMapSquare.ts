import { getMapIndexFromTile } from "@august/osrs-engine/map/MapFileIndex";
import { ClientState } from "@client/engine/game/ClientState";

export interface NpcEcsMapSquare {
    readonly mapX: number;
    readonly mapY: number;
}

/**
 * Bug #1 (instance boss visual desync): the NPC ECS's own map-square
 * bucketing (used for its local/mapBase position decomposition, raycast
 * targeting, and boundary-crossing rebase checks) used plain
 * getMapIndexFromTile() regardless of instance state, while the parallel
 * geometry-flush bucketing (OsrsClient.getNpcInstanceRenderMapId) already
 * special-cased instances to ClientState.regionX>>3 / regionY>>3 - the only
 * map square actually loaded for an active instance. A world-viewed NPC's
 * ECS bucket could therefore diverge from the one real loaded map square,
 * leaving its dynamic/interpolated position keyed off a mismatched or
 * unloaded map square until a later resync happened to correct it.
 *
 * This mirrors getNpcInstanceRenderMapId's bucket choice exactly (same
 * worldViewId >= 0 && ClientState.inInstance gate) so both subsystems always
 * agree on which map square an instanced NPC belongs to.
 */
export function resolveNpcEcsMapSquare(
    worldTileX: number,
    worldTileY: number,
    worldViewId?: number,
): NpcEcsMapSquare {
    if (typeof worldViewId === "number" && worldViewId >= 0 && ClientState.inInstance) {
        return { mapX: ClientState.regionX >> 3, mapY: ClientState.regionY >> 3 };
    }
    return {
        mapX: getMapIndexFromTile(worldTileX),
        mapY: getMapIndexFromTile(worldTileY),
    };
}
