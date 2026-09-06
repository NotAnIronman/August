import type { TheatreRoomId } from "./rooms";

export const THEATRE_BARRIER_ID = 32755;
export interface ArenaGate {
    axis: "x" | "y";
    coordinate: number;
    min: number;
    max: number;
    /** Direction from the barrier into the arena. */
    inward: -1 | 1;
    entry: boolean;
}
export interface TheatreArena {
    boss: { id: number; x: number; y: number };
    gates: readonly ArenaGate[];
}

/** Normal-mode initial forms, verified against cache revision 237. */
export const THEATRE_ARENAS: Record<TheatreRoomId, TheatreArena> = {
    maiden: { boss:{id:8360,x:3165,y:4446}, gates:[{axis:"x",coordinate:3185,min:4445,max:4448,inward:-1,entry:true}] },
    bloat: { boss:{id:8359,x:3301,y:4447}, gates:[
        {axis:"x",coordinate:3304,min:4446,max:4449,inward:-1,entry:true},
        {axis:"x",coordinate:3287,min:4446,max:4449,inward:1,entry:false},
    ] },
    nylo: { boss:{id:8354,x:3296,y:4249}, gates:[{axis:"y",coordinate:4255,min:3295,max:3296,inward:-1,entry:true}] },
    sotetseg: { boss:{id:8387,x:3279,y:4327}, gates:[{axis:"y",coordinate:4307,min:3278,max:3281,inward:1,entry:true}] },
    xarpus: { boss:{id:8338,x:3169,y:4385}, gates:[
        {axis:"y",coordinate:4379,min:3169,max:3171,inward:1,entry:true},
        {axis:"y",coordinate:4395,min:3169,max:3171,inward:-1,entry:false},
    ] },
    verzik: { boss:{id:14795,x:3168,y:4321}, gates:[] },
};

// Spawn markers only: encounter mechanics will decide when and which adds spawn.
export const MAIDEN_ADD_SPAWNS = {
    left: [3175,3179,3183,3187].map(x=>({x,y:4435})),
    right: [3175,3179,3183,3187].map(x=>({x,y:4457})),
} as const;
export const NYLO_ADD_SPAWNS = {
    left:{x:3311,y:4249}, middle:{x:3295,y:4233}, right:{x:3280,y:4249},
} as const;
export const VERZIK_WALK_DESTINATION = {x:3168,y:4303} as const;

/** Land one tile beyond the loc, not on its collision-blocked tile. */
export function arenaGateDestination(gate: ArenaGate, tile: {x:number;y:number}, player: {x:number;y:number}) {
    const across = gate.axis === "x" ? "y" : "x";
    if (tile[gate.axis] !== gate.coordinate || tile[across] < gate.min || tile[across] > gate.max ||
        player[across] < gate.min || player[across] > gate.max || Math.abs(player[across]-tile[across]) > 1 ||
        Math.abs(player[gate.axis]-gate.coordinate) !== 1) return;
    const entering = (player[gate.axis]-gate.coordinate)*gate.inward < 0;
    return { entering, destination:{...tile,[across]:player[across],[gate.axis]:gate.coordinate+(entering?gate.inward:-gate.inward)} };
}
