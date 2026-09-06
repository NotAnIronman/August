import type { NpcDropEntryDefinition as Entry, NpcDropTableDefinition, QuantityInput } from "@server/game/drops/types";
const item = (itemId: number, quantity: QuantityInput, rarity: number | string): Entry => ({ itemId, quantity, rarity });
const konar = { slayerTaskOnly: true, requiredSlayerMaster: "konar" };
// Reviewed normal-mode tables, September 2026. No quest-clue guaranteed rewards.
// https://oldschool.runescape.wiki/w/Grotesque_Guardians#Drops
export const GUARDIANS_DROP_TABLE: NpcDropTableDefinition = {
    always: [item(21726, [50, 100], "Always")],
    pools: [
        { kind: "weighted", category: "unique", rolls: 2, rollChainId: "guardians", rollChainOrder: 0,
            entries: [item(4153, 1, "1/250"), item(21736, 1, "1/500"), item(21739, 1, "1/500"),
                item(21742, 1, "1/750"), item(21730, 1, "1/1000")] },
        { kind: "weighted", category: "main", rolls: 2, rollChainId: "guardians", rollChainOrder: 1,
            entries: [
                item(1275, 1, "6/142"), item(1163, 1, "5/142"), item(1079, 1, "5/142"), item(1319, 1, "4/142"),
                item(1373, 1, "3/142"), item(1305, 1, "1/142"), item(4129, 1, "1/142"), item(1149, 1, "1/142"),
                item(7058, [4, 6], "10/142"), item(6685, 2, "8/142"), item(2434, [1, 2], "4/142"),
                ...[3044, 171, 12699].map(id => ({ ...item(id, 1, "6/142"), outcomeId: "combat-potions" })),
                item(445, [40, 50], "7/142"), item(2362, [25, 40], "6/142"), item(2358, [35, 50], "6/142"),
                item(2360, [35, 45], "6/142"), item(454, [180, 250], "5/142"), item(452, [3, 6], "4/142"), item(2364, [3, 5], "3/142"),
                item(372, 20, "1.5/142"), item(30900, 40, "1.5/142"), item(396, 20, "1/142"),
                item(995, [10000, 20000], "10/142"), item(562, [100, 150], "8/142"), item(995, 25000, "5/142"),
                item(989, 1, "5/142"), item(560, [90, 130], "5/142"), item(11232, [15, 25], "5/142"),
                item(9192, [100, 150], "3/142"), item(9193, [20, 40], "2/142"), item(9194, [10, 15], "2/142"),
                item(11237, [50, 150], "1/142"), item(566, [20, 40], "1/142"),
            ] },
        { kind: "independent", category: "tertiary", rolls: 1, entries: [
                { ...item(23083, 1, "1/44"), condition: konar }, item(12073, 1, "1/230"),
                item(21748, 1, "1/3000"), item(21745, 1, "1/5000"),
            ] },
    ],
};
const seeds = [5318, 5319, 5324, 5322, 5320, 5323, 5321, 22879];
const seedWeights = [64, 32, 16, 8, 4, 2, 1, 1];
const seedQuantities: QuantityInput[] = [[1, 4], [1, 3], [1, 3], [1, 2], [1, 2], 1, 1, 1];
const herbs = [199, 201, 203, 205, 207, 209, 211, 213, 215, 2485, 217];
const herbWeights = [32, 24, 18, 14, 11, 8, 6, 5, 4, 3, 3];
const combatHerbWeights = [0, 0, 0, 0, 0, 0, 0, 5, 4, 3, 4];
const wealth = { requiredAnyEquippedItemIds: [2572, 12785, 11980, 11982, 11984, 11986, 11988] };
// https://oldschool.runescape.wiki/w/Shellbane_gryphon#Drops
// Shared tables flattened with exact integer weights, not rounded wiki denominators.
export const GRYPHON_DROP_TABLE: NpcDropTableDefinition = {
    always: [item(532, 1, "Always"), item(31235, [7, 10], "Always")],
    pools: [
        { kind: "weighted", category: "pre_roll", rolls: 1, entries: [item(31245, 1, "1/75")] },
        { kind: "weighted", category: "main", rolls: 2, entries: [
                item(3101, 1, "10/128"), item(1333, 1, "8/128"), item(31912, [35, 50], "8/128"), item(31914, [20, 30], "6/128"),
                item(371, 1, "14/128"), item(5986, 1, "10/128"), item(5982, 1, "10/128"), item(395, 1, "4/128"),
                item(31511, 1, "1/128"), item(31513, 1, "1/128"),
                ...seeds.map((id, i) => item(id, seedQuantities[i], 15 / 128 * seedWeights[i] / 128 + (i >= 3 ? 5 / 128 * seedWeights[i] / 16 : 0))),
                ...herbs.map((id, i) => item(id, 1, 6 / 128 * herbWeights[i] / 128 + 5 / 128 * combatHerbWeights[i] / 16)),
                item(31235, [35, 50], "11/128"), item(30900, [3, 5], "10/128"), item(5376, 1, "3/128"),
                ...[[1623, 32], [1621, 16], [1619, 8], [1462, 3], [1617, 2], [830, 1], [987, 1], [985, 1]].map(([id, weight]) => ({
                    ...item(id, id === 830 ? 5 : 1, weight / 16384), altRarity: weight / 8320, altCondition: wealth,
                })),
                { ...item(1247, 1, "1/262144"), altRarity: "1/15600", altCondition: wealth },
                { ...item(2366, 1, "1/524288"), altRarity: "1/31200", altCondition: wealth },
                { ...item(1249, 1, 1 / 699050.6666666666), altRarity: "1/41600", altCondition: wealth },
            ] },
        { kind: "independent", category: "tertiary", rolls: 1, entries: [
                { ...item(23083, 1, "1/58"), condition: konar }, item(10976, 1, "1/400"), item(10977, 1, "1/5012.5"),
                item(32921, 1, "1/2000"), item(31285, 1, "1/3000"), item(12073, 1, "1/200"),
            ] },
    ],
};
