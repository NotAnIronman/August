/** Normal-mode table: https://oldschool.runescape.wiki/w/Monumental_chest
 * Prep baseline: deathless quantities and equal roster weighting. Encounter
 * scoring will replace that weighting when deaths/MVP phases are implemented.
 */
export interface TheatreChestReward {
    unique: boolean;
    claimed: boolean;
    items: Array<{itemId:number;quantity:number}>;
    pet: boolean;
    /** Cumulative claims per original item; absent on legacy, unopened rewards. */
    received?: number[];
}
export const THEATRE_UNIQUES = [
    [22477,8],[22324,2],[22481,2],[22326,2],[22327,2],[22328,2],[22486,1],
] as const;
/** All non-stackable common rewards are already noted cache IDs. */
export const THEATRE_COMMONS = [
    [22447,45,60,2], [560,500,600,1], [565,500,600,1], [1939,500,600,1],
    [454,500,600,1], [445,300,360,1], [1776,200,240,1], [450,130,156,1],
    [452,60,72,1], [246,50,60,1], [3139,50,60,1], [216,50,60,1],
    [212,40,48,1], [3050,37,44,1], [214,36,43,1], [210,34,40,1],
    [208,30,36,1], [3052,27,32,1], [2486,26,31,1], [218,24,28,1],
    [220,20,24,1], [1392,15,18,1], [1374,4,4,1], [1128,4,4,1],
    [1114,4,4,1], [5289,3,3,1], [5315,3,3,1], [5316,3,3,1], [21488,10,12,1],
] as const;
export const THEATRE_PET = 22473;
export const ELITE_CLUE = 12073;
function weighted<T extends readonly number[]>(table:readonly T[],weight:(row:T)=>number,rng:()=>number):T {
    let roll=rng()*table.reduce((n,row)=>n+weight(row),0);
    for(const row of table) {roll-=weight(row);if(roll<0)return row;}
    return table[table.length-1];
}
export function rollTheatreRewards(size:number,rng:()=>number=Math.random):TheatreChestReward[] {
    if(!Number.isInteger(size)||size<1||size>5)throw new Error("Invalid Theatre reward roster");
    // One TEAM roll, not one purple chance per player.
    const winner=rng()<1/9.1?Math.floor(rng()*size):-1;
    return Array.from({length:size},(_,index)=>{
        const items=new Map<number,number>();
        const add=(id:number,qty:number)=>items.set(id,(items.get(id)??0)+qty);
        if(index===winner)add(weighted(THEATRE_UNIQUES,r=>r[1],rng)[0],1);
        else for(let i=0;i<3;i++) {
            const [id,min,max]=weighted(THEATRE_COMMONS,r=>r[3],rng);
            add(id,min+Math.floor(rng()*(max-min+1)));
        }
        if(rng()<3/25)add(ELITE_CLUE,1);
        return {unique:index===winner,claimed:false,items:[...items].map(([itemId,quantity])=>({itemId,quantity})),pet:rng()<1/650};
    });
}
export function validTheatreRewards(value:unknown,size:number):value is TheatreChestReward[] {
    if(!Array.isArray(value)||value.length!==size)return false;
    const ids=new Set<number>([...THEATRE_COMMONS.map(r=>r[0]),...THEATRE_UNIQUES.map(r=>r[0]),ELITE_CLUE]);
    return value.filter(r=>r?.unique).length<=1 && value.every(r=>r && typeof r.unique==="boolean" &&
        typeof r.claimed==="boolean" && typeof r.pet==="boolean" && Array.isArray(r.items) && r.items.length>=1 && r.items.length<=4 &&
        r.items.every((i:{itemId:number;quantity:number})=>i && ids.has(i.itemId) && Number.isSafeInteger(i.quantity) && i.quantity>0 && i.quantity<=1800) &&
        (r.received === undefined || (Array.isArray(r.received) && r.received.length === r.items.length &&
            r.received.every((n:number,i:number)=>Number.isSafeInteger(n) && n>=0 && n<=r.items[i].quantity) &&
            r.claimed === r.received.every((n:number,i:number)=>n===r.items[i].quantity))));
}
