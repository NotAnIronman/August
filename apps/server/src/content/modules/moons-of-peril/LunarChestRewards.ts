/** Per-roll amounts, never multiplied again by the number of completed Moons.
 * Source: https://oldschool.runescape.wiki/w/Lunar_Chest (standard loot).
 */
export const LUNAR_COMMON_REWARDS = [
    {itemId:28991,min:72,max:120,weight:5}, // Atlatl darts
    {itemId:29381,min:160,max:179,weight:2}, // Blessed bone shards
    {itemId:28899,min:42,max:54,weight:1}, // Wyrmling bones
    {itemId:29378,min:6,max:12,weight:3}, // Sun-kissed bones
    {itemId:1939,min:79,max:119,weight:4}, // Swamp tar
    {itemId:571,min:30,max:45,weight:2}, // Water orbs
    {itemId:6034,min:6,max:12,weight:3}, // Supercompost
    {itemId:1761,min:15,max:25,weight:3}, // Soft clay
    {itemId:205,min:12,max:18,weight:3}, // Harralander
    {itemId:209,min:12,max:18,weight:1}, // Irit
    {itemId:5314,min:1,max:2,weight:2}, // Maple seed
    {itemId:5315,min:1,max:1,weight:1}, // Yew seed
] as const;
export function lunarChestRollCount(completed: number): number {
    return completed === 1 ? 1 : completed === 2 ? 3 : completed === 3 ? 6 : 0;
}
export function rollLunarCommonReward(random: () => number = Math.random): {itemId:number;quantity:number} {
    let roll = Math.floor(random() * 30);
    for (const item of LUNAR_COMMON_REWARDS) {
        if (roll < item.weight) return {itemId:item.itemId, quantity:item.min+Math.floor(random()*(item.max-item.min+1))};
        roll -= item.weight;
    }
    throw new RangeError("Lunar reward random value must be in [0, 1)");
}
