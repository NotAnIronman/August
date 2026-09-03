export type CraftingRecipe = {
    id: string;
    name: string;
    level: number;
    xp: number;
    inputs: readonly { itemId: number; quantity: number }[];
    outputItemId: number;
    outputQuantity?: number;
    toolItemIds?: readonly number[];
    animation?: number;
    delayTicks?: number;
};

const gem = (id: string, name: string, level: number, xp: number, input: number, output: number): CraftingRecipe => ({ id, name, level, xp, inputs: [{ itemId: input, quantity: 1 }], outputItemId: output, toolItemIds: [1755], animation: 886, delayTicks: 3 });
export const GEM_RECIPES: readonly CraftingRecipe[] = [
    gem("cut_opal", "Opal", 1, 15, 1625, 1609), gem("cut_jade", "Jade", 13, 20, 1627, 1611),
    gem("cut_red_topaz", "Red topaz", 16, 25, 1629, 1613), gem("cut_sapphire", "Sapphire", 20, 50, 1623, 1607),
    gem("cut_emerald", "Emerald", 27, 67.5, 1621, 1605), gem("cut_ruby", "Ruby", 34, 85, 1619, 1603),
    gem("cut_diamond", "Diamond", 43, 107.5, 1617, 1601), gem("cut_dragonstone", "Dragonstone", 55, 137.5, 1631, 1615),
    gem("cut_onyx", "Onyx", 67, 167.5, 6571, 6573), gem("cut_zenyte", "Zenyte", 89, 200, 19496, 19493),
];

const leather = (id: string, name: string, level: number, xp: number, input: number, output: number): CraftingRecipe => ({ id, name, level, xp, inputs: [{ itemId: input, quantity: 1 }], outputItemId: output, toolItemIds: [1733, 1734], animation: 1249, delayTicks: 3 });
export const LEATHER_RECIPES: readonly CraftingRecipe[] = [
    leather("leather_gloves", "Leather gloves", 1, 13.8, 1741, 1059), leather("leather_boots", "Leather boots", 7, 16.3, 1741, 1061),
    leather("leather_cowl", "Leather cowl", 9, 18.5, 1741, 1167), leather("leather_vamb", "Leather vambraces", 11, 22, 1741, 1063),
    leather("leather_body", "Leather body", 14, 25, 1741, 1129), leather("leather_chaps", "Leather chaps", 18, 27, 1741, 1095),
    leather("hard_body", "Hard leather body", 28, 35, 1743, 1131),
    leather("green_vamb", "Green d'hide vambraces", 57, 62, 1745, 1065), leather("green_chaps", "Green d'hide chaps", 60, 124, 1745, 1099), leather("green_body", "Green d'hide body", 63, 186, 1745, 1135),
    leather("blue_vamb", "Blue d'hide vambraces", 66, 70, 2505, 2487), leather("blue_chaps", "Blue d'hide chaps", 68, 140, 2505, 2493), leather("blue_body", "Blue d'hide body", 71, 210, 2505, 2499),
    leather("red_vamb", "Red d'hide vambraces", 73, 78, 2507, 2489), leather("red_chaps", "Red d'hide chaps", 75, 156, 2507, 2495), leather("red_body", "Red d'hide body", 77, 234, 2507, 2501),
    leather("black_vamb", "Black d'hide vambraces", 79, 86, 2509, 2491), leather("black_chaps", "Black d'hide chaps", 82, 172, 2509, 2497), leather("black_body", "Black d'hide body", 84, 258, 2509, 2503),
];

const jewellery = (id: string, name: string, level: number, xp: number, bar: number, output: number, gemId?: number): CraftingRecipe => ({
    id, name, level, xp,
    inputs: [{ itemId: bar, quantity: 1 }, ...(gemId ? [{ itemId: gemId, quantity: 1 }] : [])],
    outputItemId: output,
    // Ring, necklace, and amulet moulds respectively. The mould is retained.
    toolItemIds: [id.includes("_ring") ? 1592 : id.includes("_necklace") ? 1597 : 1595],
    animation: 899, delayTicks: 3,
});
export const JEWELLERY_RECIPES: readonly CraftingRecipe[] = [
    jewellery("gold_ring", "Gold ring", 5, 15, 2357, 1635), jewellery("gold_necklace", "Gold necklace", 6, 20, 2357, 1654), jewellery("gold_amulet", "Gold amulet (u)", 8, 30, 2357, 1673),
    jewellery("sapphire_ring", "Sapphire ring", 20, 40, 2357, 1637, 1607), jewellery("sapphire_necklace", "Sapphire necklace", 22, 55, 2357, 1656, 1607), jewellery("sapphire_amulet", "Sapphire amulet (u)", 24, 65, 2357, 1675, 1607),
    jewellery("emerald_ring", "Emerald ring", 27, 55, 2357, 1639, 1605), jewellery("emerald_necklace", "Emerald necklace", 29, 60, 2357, 1658, 1605), jewellery("emerald_amulet", "Emerald amulet (u)", 31, 70, 2357, 1677, 1605),
    jewellery("ruby_ring", "Ruby ring", 34, 70, 2357, 1641, 1603), jewellery("ruby_necklace", "Ruby necklace", 40, 75, 2357, 1660, 1603), jewellery("ruby_amulet", "Ruby amulet (u)", 50, 85, 2357, 1679, 1603),
    jewellery("diamond_ring", "Diamond ring", 43, 85, 2357, 1643, 1601), jewellery("diamond_necklace", "Diamond necklace", 56, 90, 2357, 1662, 1601), jewellery("diamond_amulet", "Diamond amulet (u)", 70, 100, 2357, 1681, 1601),
    jewellery("dragon_ring", "Dragonstone ring", 55, 100, 2357, 1645, 1615), jewellery("dragon_necklace", "Dragon necklace", 72, 105, 2357, 1664, 1615), jewellery("dragon_amulet", "Dragonstone amulet (u)", 80, 150, 2357, 1683, 1615),
    jewellery("onyx_ring", "Onyx ring", 67, 115, 2357, 6575, 6573), jewellery("onyx_necklace", "Onyx necklace", 82, 120, 2357, 6577, 6573), jewellery("onyx_amulet", "Onyx amulet (u)", 90, 165, 2357, 6579, 6573),
];

export const SILVER_RECIPES: readonly CraftingRecipe[] = [
    { id: "holy_symbol", name: "Unstrung symbol", level: 16, xp: 50, inputs: [{ itemId: 2355, quantity: 1 }], outputItemId: 1714, toolItemIds: [1599], animation: 899, delayTicks: 3 },
    { id: "unholy_symbol", name: "Unstrung emblem", level: 17, xp: 50, inputs: [{ itemId: 2355, quantity: 1 }], outputItemId: 1720, toolItemIds: [1594], animation: 899, delayTicks: 3 },
    { id: "silver_sickle", name: "Silver sickle", level: 18, xp: 50, inputs: [{ itemId: 2355, quantity: 1 }], outputItemId: 2961, toolItemIds: [2976], animation: 899, delayTicks: 3 },
    { id: "tiara", name: "Tiara", level: 23, xp: 52.5, inputs: [{ itemId: 2355, quantity: 1 }], outputItemId: 5525, toolItemIds: [5523], animation: 899, delayTicks: 3 },
];

export const GLASS_RECIPES: readonly CraftingRecipe[] = [
    { id: "molten_glass", name: "Molten glass", level: 1, xp: 20, inputs: [{ itemId: 1783, quantity: 1 }, { itemId: 1781, quantity: 1 }], outputItemId: 1775, animation: 899, delayTicks: 3 },
    { id: "vial", name: "Vial", level: 33, xp: 35, inputs: [{ itemId: 1775, quantity: 1 }], outputItemId: 229, toolItemIds: [1785], animation: 884, delayTicks: 3 },
    { id: "fishbowl", name: "Fishbowl", level: 42, xp: 42.5, inputs: [{ itemId: 1775, quantity: 1 }], outputItemId: 6667, toolItemIds: [1785], animation: 884, delayTicks: 3 },
    { id: "orb", name: "Unpowered orb", level: 46, xp: 52.5, inputs: [{ itemId: 1775, quantity: 1 }], outputItemId: 567, toolItemIds: [1785], animation: 884, delayTicks: 3 },
    { id: "lantern_lens", name: "Lantern lens", level: 49, xp: 55, inputs: [{ itemId: 1775, quantity: 1 }], outputItemId: 4542, toolItemIds: [1785], animation: 884, delayTicks: 3 },
];

export const ALL_CRAFTING_RECIPES = [...GEM_RECIPES, ...LEATHER_RECIPES, ...JEWELLERY_RECIPES, ...SILVER_RECIPES, ...GLASS_RECIPES] as const;
