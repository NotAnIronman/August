/**
 * Full real OSRS Slayer Rewards catalog — Unlock, Extend, and Buy tabs.
 *
 * Sourced directly from https://oldschool.runescape.wiki/w/Slayer_Rewards
 * (fetched fresh, page references a 22 July 2026 update, so this reflects
 * the current live game, not a stale/pre-overhaul memory of the shop).
 *
 * Costs and effects here are authored data — display and purchase work
 * fully for everything (points spent, ownership flag stored per-account
 * via SlayerTaskTracker.hasUnlock/grantUnlock, Buy items actually
 * granted). Note: the *gameplay effect* of most individual perks (e.g.
 * "Need More Darkness" actually widening Dark beast task quantities in
 * SlayerMasterDefinitions.ts) is NOT wired up for everything yet — only
 * extended_tasks/bigger_and_badder (SlayerRewardShop.ts) have a real
 * mechanical hook today. Wiring the other ~50 individual effects into
 * task generation is real, substantial follow-up work, flagged here
 * rather than silently left out of the catalog.
 *
 * The real interface also has a separate "Cosmetics" tab as of a January
 * 2026 update, split out from Unlock. Folded back into Unlock here to
 * match the reference screenshots' 4-tab structure (Unlock/Extend/Buy/
 * Tasks) rather than adding a 5th tab beyond what was scoped.
 */

export type SlayerRewardToggle = "permanent" | "toggle" | "one-time";

export interface SlayerCatalogEntry {
    key: string;
    name: string;
    cost: number;
    toggle: SlayerRewardToggle;
    description: string;
    /** Display icon in the rewards panel — a real existing item id, display-only. */
    itemId: number;
}

export interface SlayerBuyEntry {
    key: string;
    name: string;
    cost: number;
    itemId: number;
    itemQuantity: number;
    description: string;
}

export const SLAYER_UNLOCK_CATALOG: readonly SlayerCatalogEntry[] = [
    { key: "gargoyle_smasher", name: "Gargoyle Smasher", cost: 120, toggle: "permanent", itemId: 9021, description: "Gargoyles are automatically dealt the finishing blow if you have a rock hammer in your inventory." },
    { key: "slug_salter", name: "Slug Salter", cost: 10, toggle: "permanent", itemId: 3162, description: "Rock slugs are automatically dealt the finishing blow if you have a bag of salt in your inventory." },
    { key: "reptile_freezer", name: "Reptile Freezer", cost: 10, toggle: "permanent", itemId: 3021, description: "Desert lizards are automatically dealt the finishing blow if you have an ice cooler in your inventory." },
    { key: "shroom_sprayer", name: "'Shroom Sprayer", cost: 110, toggle: "permanent", itemId: 7369, description: "Mutated zygomites are automatically dealt the finishing blow if you have fungicide spray and fungicide in your inventory." },
    { key: "malevolent_masquerade", name: "Malevolent Masquerade", cost: 400, toggle: "permanent", itemId: 11864, description: "Learn to assemble a Slayer helmet, which requires level 55 Crafting." },
    { key: "ring_bling", name: "Ring Bling", cost: 150, toggle: "permanent", itemId: 11866, description: "Learn to craft a Slayer ring, which requires level 75 Crafting." },
    { key: "broader_fletching", name: "Broader Fletching", cost: 300, toggle: "permanent", itemId: 4160, description: "Learn to fletch broad arrows (level 52 Fletching), broad bolts (level 55 Fletching), and amethyst broad bolts (level 76 Fletching)." },
    { key: "seeing_red", name: "Seeing Red", cost: 50, toggle: "one-time", itemId: 5883, description: "Konar, Duradel, and Nieve will be able to assign you red dragons as your task." },
    { key: "watch_the_birdie", name: "Watch the Birdie", cost: 80, toggle: "one-time", itemId: 2977, description: "Konar, Duradel, Nieve, Chaeldar, and Krystilia will be able to assign you Aviansie as your task. Requires level 60 Agility or 60 Strength." },
    { key: "hot_stuff", name: "Hot Stuff", cost: 100, toggle: "one-time", itemId: 2977, description: "Duradel, Nieve, and Chaeldar will be able to assign TzHaar as your task. You will be offered a chance to slay TzTok-Jad." },
    { key: "like_a_boss", name: "Like a Boss", cost: 200, toggle: "one-time", itemId: 2977, description: "Konar, Duradel, Krystilia, and Nieve will be able to assign various boss monsters as your task." },
    { key: "reptile_got_ripped", name: "Reptile Got Ripped", cost: 75, toggle: "one-time", itemId: 6619, description: "Konar, Duradel, Nieve, and Chaeldar will be able to assign Lizardmen as your task." },
    { key: "bigger_and_badder", name: "Bigger and Badder", cost: 50, toggle: "toggle", itemId: 7418, description: "Certain Slayer monsters will have a chance of spawning a superior version whilst on a Slayer task. (This project: also grants +10% Slayer points per completed task — see SlayerRewardShop.ts.)" },
    { key: "duly_noted", name: "Duly Noted", cost: 200, toggle: "permanent", itemId: 2359, description: "Mithril dragons drop mithril bars in banknote form while killed on assignment." },
    { key: "stop_the_wyvern", name: "Stop the Wyvern", cost: 500, toggle: "toggle", itemId: 6653, description: "Stops you getting Fossil Island Wyvern tasks, without counting towards your blocked task limit." },
    { key: "double_trouble", name: "Double Trouble", cost: 500, toggle: "one-time", itemId: 6706, description: "Slaying Dusk and Dawn now counts for two kills towards your task rather than one." },
    { key: "basilocked", name: "Basilocked", cost: 80, toggle: "one-time", itemId: 6603, description: "Konar, Duradel, and Nieve will be able to assign Basilisks as your task." },
    { key: "actual_vampyre_slayer", name: "Actual Vampyre Slayer", cost: 80, toggle: "one-time", itemId: 23, description: "Konar, Duradel, Nieve, and Chaeldar will be able to assign Vampyres as your task." },
    { key: "task_storage", name: "Task Storage", cost: 500, toggle: "permanent", itemId: 995, description: "Gain the ability to store your task, controlled from the Tasks tab. (Storage slot mechanic not yet implemented — see SlayerRewardsPanel.ts.)" },
    { key: "i_wildy_more_slayer", name: "I Wildy More Slayer", cost: 0, toggle: "toggle", itemId: 989, description: "Krystilia will be able to assign Jellies, Dust Devils, Nechryael, and Abyssal Demons as your task." },
    { key: "warped_reality", name: "Warped Reality", cost: 60, toggle: "one-time", itemId: 8583, description: "Konar, Duradel, Nieve, and Chaeldar will be able to assign Warped creatures as your task. Requires The Path of Glouphrie." },
    { key: "lured_in", name: "Lured In", cost: 80, toggle: "one-time", itemId: 995, description: "Nieve and Duradel will be able to assign Aquanites as your task." },
    { key: "wings_spread", name: "Wings Spread", cost: 80, toggle: "one-time", itemId: 995, description: "Nieve and Duradel will be able to assign Gryphons as your task. Requires Troubled Tortugans." },
    { key: "chance_of_heavy_frost", name: "Chance of Heavy Frost", cost: 100, toggle: "one-time", itemId: 995, description: "Increases the weighting for Frost dragon tasks from Nieve and Duradel." },
] as const;

export const SLAYER_EXTEND_CATALOG: readonly SlayerCatalogEntry[] = [
    { key: "need_more_darkness", name: "Need More Darkness", cost: 100, toggle: "one-time", itemId: 6025, description: "Dark beast task quantity increased to 110-135." },
    { key: "ankou_very_much", name: "Ankou Very Much", cost: 100, toggle: "one-time", itemId: 3216, description: "Ankou task quantity increased to 91-150." },
    { key: "suq_a_nother_one", name: "Suq-a-nother One", cost: 100, toggle: "one-time", itemId: 3161, description: "Suqah task quantity increased to 186-250." },
    { key: "fire_and_darkness", name: "Fire & Darkness", cost: 50, toggle: "one-time", itemId: 265, description: "Black dragon task quantity increased to 40-60." },
    { key: "pedal_to_the_metals", name: "Pedal to the Metals", cost: 200, toggle: "one-time", itemId: 267, description: "Metal dragon (bronze/iron/steel/mithril/adamant/rune) task quantity increased to 150-200." },
    { key: "spiritual_fervour", name: "Spiritual Fervour", cost: 100, toggle: "one-time", itemId: 2025, description: "Spiritual creature task quantity increased to 181-250." },
    { key: "augment_my_abbies", name: "Augment my Abbies", cost: 100, toggle: "one-time", itemId: 415, description: "Abyssal demon task quantity increased to 200-250." },
    { key: "its_dark_in_here", name: "It's Dark in Here", cost: 100, toggle: "one-time", itemId: 4160, description: "Black demon task quantity increased to 200-250." },
    { key: "greater_challenge", name: "Greater Challenge", cost: 100, toggle: "one-time", itemId: 566, description: "Greater demon task quantity increased to 200-250." },
    { key: "bleed_me_dry", name: "Bleed Me Dry", cost: 75, toggle: "one-time", itemId: 526, description: "Bloodveld task quantity increased to 200-250." },
    { key: "smell_ya_later", name: "Smell Ya Later", cost: 100, toggle: "one-time", itemId: 1751, description: "Aberrant spectre task quantity increased to 200-250." },
    { key: "birds_of_a_feather", name: "Birds of a Feather", cost: 100, toggle: "one-time", itemId: 314, description: "Aviansie task quantity increased to 200-250." },
    { key: "horrorific", name: "Horrorific", cost: 100, toggle: "one-time", itemId: 592, description: "Cave horror task quantity increased to 200-250." },
    { key: "to_dust_you_shall_return", name: "To Dust You Shall Return", cost: 100, toggle: "one-time", itemId: 592, description: "Dust devil task quantity increased to 200-250." },
    { key: "wyver_nother_one", name: "Wyver-nother One", cost: 100, toggle: "one-time", itemId: 526, description: "Skeletal Wyvern task quantity increased to 50-75." },
    { key: "get_smashed", name: "Get Smashed", cost: 100, toggle: "one-time", itemId: 9021, description: "Gargoyle task quantity increased to 200-250." },
    { key: "nechs_please", name: "Nechs Please", cost: 100, toggle: "one-time", itemId: 1615, description: "Nechryael task quantity increased to 200-250." },
    { key: "krack_on", name: "Krack On", cost: 100, toggle: "one-time", itemId: 526, description: "Cave kraken task quantity increased to 150-200." },
    { key: "get_scabaright_on_it", name: "Get Scabaright on It", cost: 50, toggle: "one-time", itemId: 526, description: "Scabarite task quantity increased to 130-170." },
    { key: "wyver_nother_two", name: "Wyver-nother Two", cost: 100, toggle: "one-time", itemId: 526, description: "Fossil Island Wyvern task quantity increased to 55-75." },
    { key: "basilonger", name: "Basilonger", cost: 100, toggle: "one-time", itemId: 6603, description: "Basilisk task quantity increased to 200-250." },
    { key: "more_at_stake", name: "More at Stake", cost: 100, toggle: "one-time", itemId: 23, description: "Vampyre task quantity increased to 200-250." },
    { key: "revenenenenenants", name: "Revenenenenants", cost: 100, toggle: "toggle", itemId: 21818, description: "Revenant task quantity increased to 100-150." },
    { key: "more_eyes_than_sense", name: "More eyes than sense", cost: 150, toggle: "one-time", itemId: 27392, description: "Araxyte task quantity increased to 200-250." },
    { key: "un_restraining_order", name: "Un-restraining Order", cost: 100, toggle: "one-time", itemId: 526, description: "Custodian stalker task quantity increased to 200-250." },
    { key: "lets_stay_all_aquanite", name: "Let's Stay All Aquanite", cost: 100, toggle: "one-time", itemId: 526, description: "Aquanite task quantity increased to 150-200." },
    { key: "can_of_wyrms", name: "Can of Wyrms", cost: 100, toggle: "one-time", itemId: 526, description: "Wyrm task quantity increased to 200-250." },
    { key: "gryphon_and_on", name: "Gryphon and on", cost: 50, toggle: "one-time", itemId: 526, description: "Gryphon task quantity increased by 80." },
    { key: "i_see_dragons", name: "I see Dragons", cost: 100, toggle: "one-time", itemId: 267, description: "Frost dragon task quantity increased to 180-240." },
] as const;

export const SLAYER_BUY_CATALOG: readonly SlayerBuyEntry[] = [
    { key: "slayer_ring_8", name: "Slayer ring (8)", cost: 75, itemId: 11866, itemQuantity: 1, description: "An equipable ring providing an Enchanted gem's functions plus 8 teleport charges to useful Slayer sites." },
    { key: "broad_bolts", name: "Broad bolts (x250)", cost: 35, itemId: 11875, itemQuantity: 250, description: "Bolts that can damage Turoths and Kurask. Requires level 55 Slayer and 61 Ranged with a suitable crossbow." },
    { key: "broad_arrows", name: "Broad arrows (x250)", cost: 35, itemId: 4160, itemQuantity: 250, description: "Arrows that can damage Turoths and Kurask. Requires level 55 Slayer and 50 Ranged with a suitable bow." },
    { key: "herb_sack", name: "Herb sack", cost: 750, itemId: 13226, itemQuantity: 1, description: "Stores up to 30 of each type of grimy herb (450 total). Requires level 58 Herblore to use." },
    { key: "rune_pouch", name: "Rune pouch", cost: 750, itemId: 12791, itemQuantity: 1, description: "Stores up to 16,000 of three types of runes. Only one can be owned." },
    { key: "looting_bag", name: "Looting bag", cost: 10, itemId: 11941, itemQuantity: 1, description: "Within the Wilderness and certain other PvP areas, tradeable items can be stored in the looting bag." },
] as const;

const unlockByKey = new Map(SLAYER_UNLOCK_CATALOG.map((e) => [e.key, e]));
const extendByKey = new Map(SLAYER_EXTEND_CATALOG.map((e) => [e.key, e]));
const buyByKey = new Map(SLAYER_BUY_CATALOG.map((e) => [e.key, e]));

export function getSlayerUnlockEntry(key: string): SlayerCatalogEntry | undefined {
    return unlockByKey.get(key);
}
export function getSlayerExtendEntry(key: string): SlayerCatalogEntry | undefined {
    return extendByKey.get(key);
}
export function getSlayerBuyEntry(key: string): SlayerBuyEntry | undefined {
    return buyByKey.get(key);
}
