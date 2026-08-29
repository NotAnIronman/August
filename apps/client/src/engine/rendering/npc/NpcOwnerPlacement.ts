const MAP_SQUARE_SIZE = 64;

function getMapSquareId(mapX: number, mapY: number): number {
    return ((mapX | 0) << 8) + (mapY | 0);
}

function getMapIndexFromTile(tile: number): number {
    return Math.floor((tile | 0) / MAP_SQUARE_SIZE);
}

function getWorldEntityOverlayMapId(worldViewId: number): number {
    const overlayMapX = 200 + (worldViewId | 0);
    const overlayMapY = 200 + (worldViewId | 0);
    return getMapSquareId(overlayMapX, overlayMapY);
}

export type NpcOwnerPlacement = {
    mapX: number;
    mapY: number;
    tileX: number;
    tileY: number;
    startX: number;
    startY: number;
    usesOverlayWorldView: boolean;
};

export function resolveNpcOwnerPlacement(
    currentMapId: number,
    currentMapX: number,
    currentMapY: number,
    renderBaseTileX: number,
    renderBaseTileY: number,
    tileX: number,
    tileY: number,
    size: number,
    worldViewId?: number,
): NpcOwnerPlacement {
    const normalizedWorldViewId =
        typeof worldViewId === "number" && worldViewId >= 0 ? worldViewId | 0 : -1;
    const overlayMapId =
        normalizedWorldViewId >= 0 ? getWorldEntityOverlayMapId(normalizedWorldViewId) : -1;
    const usesOverlayWorldView = normalizedWorldViewId >= 0 && currentMapId === overlayMapId;
    const worldTileX = (renderBaseTileX + (tileX | 0)) | 0;
    const worldTileY = (renderBaseTileY + (tileY | 0)) | 0;
    const ownerMapX = usesOverlayWorldView
        ? getMapIndexFromTile(worldTileX)
        : currentMapX | 0;
    const ownerMapY = usesOverlayWorldView
        ? getMapIndexFromTile(worldTileY)
        : currentMapY | 0;
    const localTileX = (worldTileX - ownerMapX * MAP_SQUARE_SIZE) | 0;
    const localTileY = (worldTileY - ownerMapY * MAP_SQUARE_SIZE) | 0;

    return {
        mapX: ownerMapX,
        mapY: ownerMapY,
        tileX: localTileX,
        tileY: localTileY,
        startX: (localTileX * 128 + (size | 0) * 64) | 0,
        startY: (localTileY * 128 + (size | 0) * 64) | 0,
        usesOverlayWorldView,
    };
}
