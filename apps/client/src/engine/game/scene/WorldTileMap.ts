import { getMapSquareId } from "@august/osrs-engine/map/MapFileIndex";
import type { MapManager, MapSquare } from "@client/engine/game/MapManager";

/** A private instance is one chunk-aligned, 104-tile mesh, not a 64-tile square. */
export interface WorldTileMap extends MapSquare {
    getRenderBaseTileX?(): number;
    getRenderBaseTileY?(): number;
    getLocalTileSpan?(): number;
    baseWorldX?: number;
    baseWorldY?: number;
    heightMapSize?: number;
    borderSize?: number;
}

export function worldTileMapBounds(map: WorldTileMap) {
    const minX = map.getRenderBaseTileX?.() ?? map.baseWorldX ?? map.mapX * 64;
    const minY = map.getRenderBaseTileY?.() ?? map.baseWorldY ?? map.mapY * 64;
    const size =
        map.getLocalTileSpan?.() ??
        (map.heightMapSize !== undefined ? map.heightMapSize - 2 * (map.borderSize ?? 0) : 64);
    return { minX, minY, maxX: minX + size, maxY: minY + size };
}

export function mapContainsWorldTile(map: WorldTileMap, x: number, y: number): boolean {
    const b = worldTileMapBounds(map);
    return x >= b.minX && x < b.maxX && y >= b.minY && y < b.maxY;
}

export function resolveWorldTileMap<T extends MapSquare>(
    maps: MapManager<T>,
    x: number,
    y: number,
): T | undefined {
    const direct = maps.getMap(Math.floor(x / 64), Math.floor(y / 64));
    if (
        direct &&
        !maps.worldEntityMapIds?.has(getMapSquareId(direct.mapX, direct.mapY)) &&
        mapContainsWorldTile(direct, x, y)
    ) return direct;
    // Keep getMap itself an exact resource-ID lookup. Terrain/height consumers
    // explicitly opt into footprint lookup, excluding sailing overlay meshes.
    for (const map of maps.mapSquares?.values() ?? []) {
        if (maps.worldEntityMapIds?.has(getMapSquareId(map.mapX, map.mapY))) continue;
        if (mapContainsWorldTile(map, x, y)) return map;
    }
    return undefined;
}
