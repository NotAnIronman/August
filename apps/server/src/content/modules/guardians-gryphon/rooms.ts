import type { InstanceAreaCopy } from "@server/world/InstancedAreaManager";
export const BOSS_ROOMS = [
    { id: "grotesque-guardians", name: "Grotesque Guardians", door: 31681, exitId: 31674, logId: 489,
        outside: { x: 3427, y: 3541, level: 2 }, inside: { x: 1696, y: 4567, level: 0 },
        gate: { x: 3426, y: 3542, level: 2 },
        bounds: { minX: 1673, maxX: 1720, minY: 4552, maxY: 4597 },
        bosses: [{ id: 7882, x: 1689, y: 4573 }, { id: 7852, x: 1701, y: 4573 }], rewardNpcId: 7882 },
    { id: "shellbane-gryphon", name: "Shellbane Gryphon", door: 58439, exitId: 58442, logId: 6337,
        outside: { x: 3175, y: 2478, level: 0 }, inside: { x: 3168, y: 8874, level: 0 },
        gate: { x: 3175, y: 2478, level: 0 },
        bounds: { minX: 3162, maxX: 3195, minY: 8859, maxY: 8891 },
        bosses: [{ id: 14860, x: 3179, y: 8872 }], rewardNpcId: 14860 },
] as const;
export type FoundationRoom = typeof BOSS_ROOMS[number];
export function roomGeometry(room: FoundationRoom) {
    const b = room.bounds;
    const sceneBase = { x: Math.floor((b.minX - 4) / 8) * 8, y: Math.floor((b.minY - 4) / 8) * 8 };
    const copy: InstanceAreaCopy = { sourceBaseX: sceneBase.x, sourceBaseY: sceneBase.y,
        widthChunks: Math.floor((b.maxX + 4) / 8) - sceneBase.x / 8 + 1,
        heightChunks: Math.floor((b.maxY + 4) / 8) - sceneBase.y / 8 + 1,
        sourcePlanes: [0, 1, 2, 3], destinationChunkX: 0, destinationChunkY: 0 };
    return { sceneBase, copy };
}
