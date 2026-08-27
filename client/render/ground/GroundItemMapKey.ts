const MAP_SQUARE_SHIFT = 6;

export function getGroundItemMapId(tileX: number, tileY: number): number {
    return (((tileX | 0) >> MAP_SQUARE_SHIFT) << 8) + ((tileY | 0) >> MAP_SQUARE_SHIFT);
}

export function decodeGroundItemMapId(mapId: number): { mapX: number; mapY: number } {
    return { mapX: ((mapId | 0) >> 8) & 0xff, mapY: (mapId | 0) & 0xff };
}
