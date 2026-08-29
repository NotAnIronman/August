import { NpcData } from "@client/engine/rendering/npc/NpcData";

export type NpcGeometryLoadContext = {
    baseTileX?: number;
    baseTileY?: number;
    tileSpan?: number;
    worldViewId?: number;
};

export type NpcGeometryData = {
    mapX: number;
    mapY: number;
    borderSize: number;
    npcs: NpcData[];
    vertices: Uint8Array;
    indices: Int32Array;
    loadedTextures: Map<number, Int32Array>;
};
