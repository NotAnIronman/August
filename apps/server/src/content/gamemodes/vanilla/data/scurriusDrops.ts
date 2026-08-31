import type { NpcDropTableDefinition } from "@server/game/drops/types";

/**
 * The Wiki snapshot currently cannot parse Scurrius' dedicated drop-page
 * layout, so its otherwise automatic table is authored here.  Keep this as a
 * normal drop-table definition (rather than a death-script) so it appears in
 * the NPC drop viewer and follows all standard ownership/drop-rate handling.
 */
export const SCURRIUS_DROP_TABLE: NpcDropTableDefinition = {
    always: [
        { itemId: 532, quantity: 1 }, // Big bones
        { itemId: 2134, quantity: 1 }, // Raw rat meat
    ],
    pools: [
        {
            kind: "weighted", category: "main", rolls: 1, rollGroupId: "scurrius:main",
            entries: [
                { itemId: 1123, quantity: 1, rarity: "6/100" }, // Adamant platebody
                { itemId: 1147, quantity: 1, rarity: "6/100" }, // Rune med helm
                { itemId: 1163, quantity: 1, rarity: "6/100" }, // Rune full helm
                { itemId: 1185, quantity: 1, rarity: "6/100" }, // Rune sq shield
                { itemId: 1113, quantity: 1, rarity: "6/100" }, // Rune chainbody
                { itemId: 1373, quantity: 1, rarity: "6/100" }, // Rune battleaxe
                { itemId: 890, quantity: [20, 50], rarity: "6/100" }, // Adamant arrows
                { itemId: 892, quantity: [20, 50], rarity: "6/100" }, // Rune arrows
                { itemId: 562, quantity: [70, 125], rarity: "6/100" }, // Chaos runes
                { itemId: 560, quantity: [40, 90], rarity: "3/100" }, // Death runes
                { itemId: 563, quantity: [10, 30], rarity: "3/100" }, // Law runes
                { itemId: 161, quantity: 1, rarity: "6/100" }, // Super strength(1)
                { itemId: 173, quantity: 1, rarity: "6/100" }, // Ranging potion(1)
                { itemId: 333, quantity: [1, 3], rarity: "6/100" }, // Trout
                { itemId: 361, quantity: [1, 3], rarity: "6/100" }, // Tuna
                { itemId: 379, quantity: [1, 3], rarity: "6/100" }, // Lobster
                { itemId: 385, quantity: 1, rarity: "3/100" }, // Shark
                { itemId: 995, quantity: [1000, 9000], rarity: "6/100" },
                { itemId: 1985, quantity: 1, rarity: "1/100" }, // Cheese
            ],
        },
        {
            kind: "independent", category: "unique", rolls: 1,
            entries: [
                { itemId: 28798, quantity: 1, rarity: "1/33" }, // Scurrius' spine
                { itemId: 28801, quantity: 1, rarity: "1/3000" }, // Scurry pet
            ],
        },
        {
            kind: "independent", category: "tertiary", rolls: 1,
            entries: [
                { itemId: 2801, quantity: 1, rarity: "1/25" }, // Medium clue scroll
                { itemId: 10976, quantity: 1, rarity: "1/400" },
                { itemId: 10977, quantity: 1, rarity: "1/5012.5" },
            ],
        },
    ],
};
