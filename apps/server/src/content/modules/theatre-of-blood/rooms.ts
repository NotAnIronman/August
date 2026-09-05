import type { InstanceAreaCopy } from "@server/world/InstancedAreaManager";

export const THEATRE_ENTRANCE_ID = 32653;
export const THEATRE_OUTSIDE = {x:3677,y:3219,level:0} as const;
export const THEATRE_ROOMS = [
    {id:"maiden",name:"Maiden",entrance:{x:3219,y:4460,level:0},exitId:33113,minX:3155,maxX:3225,minY:4422,maxY:4463},
    {id:"bloat",name:"Bloat",entrance:{x:3322,y:4447,level:0},exitId:33113,minX:3269,maxX:3322,minY:4433,maxY:4462},
    {id:"nylo",name:"Nylo",entrance:{x:3295,y:4283,level:0},exitId:33113,minX:3280,maxX:3311,minY:4233,maxY:4283},
    {id:"sotetseg",name:"Sotetseg",entrance:{x:3280,y:4293,level:0},exitId:33113,minX:3267,maxX:3292,minY:4293,maxY:4334},
    {id:"xarpus",name:"Xarpus",entrance:{x:3170,y:4375,level:1},exitId:32751,minX:3155,maxX:3185,minY:4374,maxY:4400},
    {id:"verzik",name:"Verzik",entrance:{x:3168,y:4297,level:0},exitId:33113,minX:3153,maxX:3183,minY:4296,maxY:4328},
] as const;
export type TheatreRoomId = typeof THEATRE_ROOMS[number]["id"];
export const XARPUS_SKELETON_ID = 32741;

export function theatreRoomGeometry(index: number) {
    const room = THEATRE_ROOMS[index];
    if (!room) throw new Error("Invalid Theatre room");
    const bounds = {minX:room.minX-4,maxX:room.maxX+4,minY:room.minY-4,maxY:room.maxY+4};
    const sceneBase = {x:Math.floor(bounds.minX/8)*8,y:Math.floor(bounds.minY/8)*8};
    const copy: InstanceAreaCopy = {
        sourceBaseX:sceneBase.x,sourceBaseY:sceneBase.y,
        widthChunks:Math.floor(bounds.maxX/8)-sceneBase.x/8+1,
        heightChunks:Math.floor(bounds.maxY/8)-sceneBase.y/8+1,
        // Logical player planes are not standalone terrain layers: the first
        // four entrances stand on plane-1 bridges linked down to plane 0, and
        // Xarpus's plane-1 room depends on the pit/height base below it. Preserve
        // the complete cache column, including roofs and bridge collision.
        destinationChunkX:0,destinationChunkY:0,sourcePlanes:[0,1,2,3],
    };
    if (copy.widthChunks > 13 || copy.heightChunks > 13) throw new Error("Theatre room exceeds instance view");
    return {room,bounds,sceneBase,copy};
}
