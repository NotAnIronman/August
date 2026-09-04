import type { ThievingFailurePolicy } from "@server/game/skilling/ThievingPolicy";

export interface PickpocketEvidence {
    status: "verified" | "provisional" | "unsupported";
    source: string;
    retrieved: string;
    notes?: string;
}

// -- Rarity weights (higher = more common) --
const ALWAYS = 256;
const COMMON = 256;
const UNCOMMON = 32;
const RARE = 8;
const VERY_RARE = 1;

// -- Loot table entry --
export interface PickpocketLoot {
    itemId: number;
    minAmount: number;
    maxAmount: number;
    weight: number;
}

function loot(itemId: number, amount: number | [number, number], weight: number): PickpocketLoot {
    const [minAmount, maxAmount] = Array.isArray(amount) ? amount : [amount, amount];
    return { itemId, minAmount, maxAmount, weight };
}

// -- Pickpocket NPC definition --
export interface PickpocketNpcDef {
    npcIds: number[];
    reqLevel: number;
    xp: number;
    lootTable: PickpocketLoot[];
    /** Award every entry; weights ignored. May accompany an empty weighted table. */
    guaranteedLoot?: PickpocketLoot[];
    failure?: ThievingFailurePolicy;
    successDamage?: { amount: number; preventedByEquippedItemIds: readonly number[] };
    failureChat?: string;
    disabledReason?: string;
    /** Verified internal quest ID, requiring completion (not merely starting). */
    requiredQuest?: string;
    lootEvidence?: PickpocketEvidence;
    chanceEvidence?: PickpocketEvidence;
    requirementEvidence?: PickpocketEvidence;
    failureEvidence?: PickpocketEvidence;
    coinPouchId?: number;
    minDamage: number;
    maxDamage: number;
    stunTicks: number;
    displayName?: string;
    /**
     * Wiki success endpoints at thieving levels 1 and 99; runtime rounds the
     * combined interpolation, adds one and divides by 256. When absent,
     * falls back to the generic 55-95% curve from reqLevel to 99.
     */
    lowChance?: number;
    highChance?: number;
}

// ---------------------------------------------------------------------------
// Item IDs
// ---------------------------------------------------------------------------
export const Items = {
    COINS_995: 995,
    POTATO_SEED: 5318,
    ONION_SEED: 5319,
    CABBAGE_SEED: 5324,
    TOMATO_SEED: 5322,
    SWEETCORN_SEED: 5320,
    STRAWBERRY_SEED: 5323,
    WATERMELON_SEED: 5321,
    BARLEY_SEED: 5305,
    HAMMERSTONE_SEED: 5307,
    ASGARNIAN_SEED: 5308,
    JUTE_SEED: 5306,
    YANILLIAN_SEED: 5309,
    KRANDORIAN_SEED: 5310,
    WILDBLOOD_SEED: 5311,
    MARIGOLD_SEED: 5096,
    NASTURTIUM_SEED: 5098,
    ROSEMARY_SEED: 5097,
    WOAD_SEED: 5099,
    LIMPWURT_SEED: 5100,
    REDBERRY_SEED: 5101,
    CADAVABERRY_SEED: 5102,
    DWELLBERRY_SEED: 5103,
    JANGERBERRY_SEED: 5104,
    WHITEBERRY_SEED: 5105,
    POISON_IVY_SEED: 5106,
    GUAM_SEED: 5291,
    MARRENTILL_SEED: 5292,
    TARROMIN_SEED: 5293,
    HARRALANDER_SEED: 5294,
    RANARR_SEED: 5295,
    TOADFLAX_SEED: 5296,
    IRIT_SEED: 5297,
    AVANTOE_SEED: 5298,
    KWUARM_SEED: 5299,
    SNAPDRAGON_SEED: 5300,
    CADANTINE_SEED: 5301,
    LANTADYME_SEED: 5302,
    DWARF_WEED_SEED: 5303,
    TORSTOL_SEED: 5304,
    MUSHROOM_SPORE: 5282,
    BELLADONNA_SEED: 5281,
    CACTUS_SEED: 5280,
    AIR_RUNE: 556,
    LOCKPICK: 1523,
    JUG_OF_WINE: 1993,
    GOLD_BAR: 2357,
    IRON_DAGGERP: 1219,
    CHAOS_RUNE: 562,
    DEATH_RUNE: 560,
    BLOOD_RUNE: 565,
    GOLD_ORE: 444,
    FIRE_ORB: 569,
    DIAMOND: 1601,
    EARTH_RUNE: 557,
    SWAMP_TOAD: 2150,
    KING_WORM: 2162,
    BREAD: 2309,
    ANTIPOISON3: 175,
    TOKKUL: 6529,
    UNCUT_SAPPHIRE: 1623,
    UNCUT_EMERALD: 1621,
    UNCUT_RUBY: 1619,
    UNCUT_DIAMOND: 1617,
    BRONZE_ARROW: 882,
    BRONZE_AXE: 1351,
    BRONZE_PICKAXE: 1265,
    IRON_AXE: 1349,
    IRON_DAGGER: 1203,
    IRON_PICKAXE: 1267,
    BUTTONS: 688,
    FEATHER: 314,
    KNIFE: 946,
    LOGS: 1511,
    NEEDLE: 1733,
    RAW_ANCHOVIES: 321,
    RAW_CHICKEN: 2138,
    THREAD: 1734,
    TINDERBOX: 590,
    UNCUT_OPAL: 1625,
    LEATHER_BODY: 1129,
    HAM_BOOTS: 4310,
    HAM_CLOAK: 4306,
    HAM_GLOVES: 4308,
    HAM_HOOD: 4302,
    HAM_LOGO: 4312,
    HAM_SHIRT: 4298,
    STEEL_ARROW: 886,
    STEEL_AXE: 1353,
    STEEL_DAGGER: 1207,
    STEEL_PICKAXE: 1269,
    CLUE_SCROLL_EASY: 2677,
    COAL: 453,
    COWHIDE: 1739,
    DAMAGED_ARMOUR: 4509,
    GRIMY_GUAM_LEAF: 199,
    GRIMY_MARRENTILL: 201,
    GRIMY_TARROMIN: 203,
    IRON_ORE: 440,
    RUSTY_SWORD: 686,
    UNCUT_JADE: 1627,
    BAT_SHISH: 10964,
    COATED_FROGS_LEGS: 10963,
    FINGERS: 10965,
    FROGBURGER: 10962,
    FROGSPAWN_GUMBO: 10961,
    GREEN_GLOOP_SOUP: 10960,
    BULLSEYE_LANTERN: 4550,
    CAVE_GOBLIN_WIRE: 10981,
    OIL_LANTERN: 4539,
    UNLIT_TORCH: 596,
};

// ---------------------------------------------------------------------------
// NPC Definitions
// ---------------------------------------------------------------------------

const RETRIEVED = "2026-09-04";
function evidence(title: string, status: PickpocketEvidence["status"] = "verified", notes?: string): PickpocketEvidence {
    return { source: "https://oldschool.runescape.wiki/w/" + encodeURIComponent(title.replace(/ /g, "_")), retrieved: RETRIEVED, status, notes };
}
const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => first + i);
function curve(title: string, lowChance: number, highChance: number): Partial<PickpocketNpcDef> {
    return { lowChance, highChance, chanceEvidence: evidence(title, "verified", "Normal pickpocket chart endpoints at levels 1 and 99; excludes historical/knockout charts.") };
}
function profile(name: string, npcIds: number[], reqLevel: number, xp: number, damage: number, lootTable: PickpocketLoot[], title: string, extra: Partial<PickpocketNpcDef> = {}): PickpocketNpcDef {
    return { displayName: name, npcIds, reqLevel, xp, minDamage: damage, maxDamage: damage, stunTicks: 8, lootTable,
        failure: { kind: "stun" }, lootEvidence: evidence(title), requirementEvidence: evidence(title),
        chanceEvidence: evidence(title, "provisional", "No verified ordinary curve; runtime fallback is tuning, not OSRS evidence."),
        failureEvidence: evidence(title, "provisional", "Eight action-lock ticks retained; rounded Wiki seconds do not establish phase timing."),
        ...extra };
}
function unsupported(name: string, npcIds: number[], title: string, reason: string, reqLevel = 1, xp = 0): PickpocketNpcDef {
    return profile(name, npcIds, reqLevel, xp, 0, [], title, { disabledReason: reason, stunTicks: 0,
        lootEvidence: evidence(title, "unsupported", reason),
        requirementEvidence: evidence(title, "unsupported", "Level is descriptive only; exact quest stage/ownership or NPC variant needs a dedicated handler."),
        failureEvidence: evidence(title, "unsupported", reason) });
}

// Conditional ordinary H.A.M. 100-slot table; clue roll and quest override are separate.
const HAM_LOOT = [
    ...[4310, 4306, 4308, 4302, 4312, 4300, 4298].map(id => loot(id, 1, 1)),
    loot(882, [1, 13], 3), ...[1351, 1205, 1265, 1349, 1203, 1267, 1129].map(id => loot(id, 1, 3)),
    loot(886, [1, 13], 2), ...[1353, 1207, 1269].map(id => loot(id, 1, 2)),
    loot(688, 1, 4), loot(995, [1, 21], 17), loot(314, [1, 7], 3), loot(946, 1, 2),
    loot(1511, 1, 3), loot(1733, 1, 2), loot(321, 1, 2), loot(2138, 1, 2),
    loot(1734, [1, 10], 3), ...[590, 1625, 453].map(id => loot(id, 1, 2)),
    loot(1739, 1, 3), loot(4509, 1, 4), loot(199, 1, 12 / 11), loot(201, 1, 6 / 11),
    loot(203, 1, 4 / 11), loot(440, 1, 2), loot(686, 1, 4), loot(1627, 1, 2),
];
// Rounded Wiki frequencies at Farming 85, normalized as weights: provisional until
// the Farming-dependent nested table is supported. These are not exact probabilities.
const MASTER_SEEDS: [number, number | [number, number], number][] = [
    [5318, [1, 4], 5.65], [5319, [1, 3], 7.53], [5324, [1, 3], 14.4], [5322, [1, 2], 15.7],
    [5320, [1, 2], 45.2], [5323, 1, 90.4], [5321, 1, 189], [22879, 1, 260],
    [5305, [1, 12], 18], [5307, [1, 9], 18], [5308, [1, 6], 23.9], [5306, [1, 9], 24.1],
    [5309, [1, 6], 36.1], [5310, [1, 6], 72.2], [5311, [1, 3], 142],
    [5096, 1, 21.8], [5098, 1, 32.9], [5097, 1, 50.9], [5099, 1, 68.9], [5100, 1, 86.3],
    [5101, 1, 25.8], [5102, 1, 36.8], [5103, 1, 51.5], [5104, 1, 129], [5105, 1, 355], [5106, 1, 937],
    [5282, 1, 492], [5281, 1, 820], [5280, 1, 1230], [21490, 1, 1892], [22873, 1, 2460],
    [5291, 1, 67.2], [5292, 1, 95.6], [5293, 1, 140], [5294, 1, 206], [5295, 1, 268.75],
    [5296, 1, 443], [5297, 1, 651], [5298, 1, 947], [5299, 1, 1389], [5300, 1, 1854.4],
    [5301, 1, 2976], [5302, 1, 4167], [5303, 1, 6944], [5304, 1, 9271.98],
];

const PICKPOCKET_NPCS: PickpocketNpcDef[] = [
    {
        npcIds: [
            // Man (r237 cache-verified)
            3014, 3106, 3107, 3108, 3109, 3110, 3261, 3264, 3265, 3298, 3652, 6815, 6818, 6987,
            6988, 6989, 11057, 11058, 14920,
            // Woman (r237 cache-verified)
            3015, 3111, 3112, 3113, 3268, 3299, 6990, 6991, 6992, 10728, 11053, 11054, 14921,
        ],
        reqLevel: 1,
        xp: 8,
        lootTable: [loot(Items.COINS_995, 3, ALWAYS)],
        coinPouchId: 22521,
        minDamage: 1,
        maxDamage: 1,
        stunTicks: 8,
        // Wiki engine endpoints; see ThievingPolicy for rounding and denominator.
        lowChance: 180,
        highChance: 240,
    },
    {
        // Farmer (r237 cache-verified)
        npcIds: [
            3114, 3243, 3244, 11918, 11919, 11920, 11921, 13228, 13229, 13230, 13231, 13232, 13233,
            13234, 13235, 14751, 14752, 14753, 14754, 14773,
        ],
        reqLevel: 10,
        xp: 14.5,
        lootTable: [loot(Items.COINS_995, 9, 123), loot(Items.POTATO_SEED, 1, 5)],
        coinPouchId: 22522,
        minDamage: 1,
        maxDamage: 1,
        stunTicks: 8,
        displayName: "Farmer",
    },
    {
        // HAM Female
        npcIds: [2541],
        reqLevel: 15,
        xp: 22.2,
        lootTable: HAM_LOOT,
        coinPouchId: 22523,
        minDamage: 1,
        maxDamage: 3,
        stunTicks: 6,
    },
    {
        // HAM Male
        npcIds: [2540],
        reqLevel: 15,
        xp: 22.2,
        lootTable: HAM_LOOT,
        coinPouchId: 22523,
        minDamage: 1,
        maxDamage: 3,
        stunTicks: 6,
    },
    {
        // Al-Kharid Warrior (r237 cache-verified)
        npcIds: [3292, 3260, 11925, 11926, 11927, 11928, 11929],
        reqLevel: 25,
        xp: 26,
        lootTable: [loot(Items.COINS_995, 18, ALWAYS)],
        coinPouchId: 22524,
        minDamage: 2,
        maxDamage: 2,
        stunTicks: 8,
    },
    {
        // Rogue (r237 cache-verified)
        npcIds: [526],
        reqLevel: 32,
        xp: 36.5,
        lootTable: [
            loot(Items.COINS_995, [25, 40], 123),
            loot(Items.AIR_RUNE, 8, 9),
            loot(Items.LOCKPICK, 1, 5),
            loot(Items.JUG_OF_WINE, 1, 6),
            loot(Items.IRON_DAGGERP, 1, 1),
        ],
        coinPouchId: 22525,
        minDamage: 2,
        maxDamage: 2,
        stunTicks: 8,
    },
    {
        // Cave Goblin
        npcIds: [
            2268, 2269, 2270, 2271, 2272, 2273, 2274, 2275, 2276, 2277, 2278, 2279, 2280, 2281,
            2282, 2283, 2284, 2285,
        ],
        reqLevel: 36,
        xp: 40,
        lootTable: [
            ...[10964, 10963, 10965, 10962, 10961, 10960].map(id => loot(id, 1, 1)),
            loot(995, [10, 50], 7), loot(4550, 1, 1), loot(10981, 1, 1),
            loot(440, [1, 4], 1), loot(4539, 1, 1), loot(1939, 1, 1), loot(590, 1, 1), loot(596, 1, 1),
        ],
        coinPouchId: 22526,
        minDamage: 1,
        maxDamage: 1,
        stunTicks: 8,
    },
    {
        // Master Farmer (r237 cache-verified)
        npcIds: [
            5730, 5731, 5832, 11940, 11941, 13236, 13237, 13238, 13239, 13240, 13241, 13242, 13243,
            14755, 14756, 14757, 14758,
        ],
        reqLevel: 38,
        xp: 43,
        lootTable: MASTER_SEEDS.map(([id, amount, denominator]) => loot(id, amount, 1 / denominator)),
        minDamage: 3,
        maxDamage: 3,
        stunTicks: 8,
        displayName: "Master Farmer",
    },
    {
        // Guard (r237 cache-verified)
        npcIds: [
            397, 398, 399, 400, 1546, 1547, 1548, 1549, 1550, 3010, 3011, 3254, 3269, 3270, 3271,
            3272, 3273, 3274, 3283, 4522, 4523, 4524, 4525, 4526, 5418, 11092, 11094, 11096, 11098,
            11100, 11102, 11104, 11106, 11911, 11912, 11913, 11914, 11915, 11916, 11917, 11922,
            11923, 11924, 11937, 11938, 11939, 11942, 11943, 11944, 11945, 11946, 11947, 13100,
            13101, 13102, 13103, 13104, 13105, 13106, 13107, 13108, 13109, 13986, 13987, 13988,
            13989, 13990, 13991, 13992, 13993, 13994, 13995, 14663, 14664, 14665, 14666, 14667,
            14668, 14669, 14670, 14716, 14717, 14718, 14719, 14720, 14721, 14722, 14723, 14887,
            14888, 14889, 14890,
        ],
        reqLevel: 40,
        xp: 46.8,
        lootTable: [loot(Items.COINS_995, 30, ALWAYS)],
        coinPouchId: 22527,
        minDamage: 2,
        maxDamage: 2,
        stunTicks: 8,
    },
    {
        // Fremennik Citizens (r237 cache-verified)
        npcIds: [3937, 3938, 3939, 3940, 3941, 3943, 3944, 3945, 3946],
        reqLevel: 45,
        xp: 65,
        lootTable: [loot(Items.COINS_995, 40, ALWAYS)],
        coinPouchId: 22528,
        requiredQuest: "fremennik_trials",
        minDamage: 2,
        maxDamage: 2,
        stunTicks: 8,
        displayName: "Fremennik",
    },
    {
        // Bearded Pollnivian Bandit
        npcIds: [736, 737],
        reqLevel: 45,
        xp: 65,
        lootTable: [loot(Items.COINS_995, 40, ALWAYS)],
        coinPouchId: 22529,
        minDamage: 5,
        maxDamage: 5,
        stunTicks: 8,
    },
    {
        // Desert Bandit
        npcIds: [690, 695],
        reqLevel: 53,
        xp: 79.4,
        lootTable: [
            loot(Items.COINS_995, 30, 5),
            loot(179, 1, 1), // Antipoison(1), not Antipoison(3).
            loot(Items.LOCKPICK, 1, 1),
        ],
        coinPouchId: 22530,
        minDamage: 3,
        maxDamage: 3,
        stunTicks: 8,
    },
    {
        // Knight of Ardougne (r237 cache-verified)
        npcIds: [3297, 3300, 8854, 11902, 11936],
        reqLevel: 55,
        xp: 84.3,
        lootTable: [loot(Items.COINS_995, 50, ALWAYS)],
        coinPouchId: 22531,
        minDamage: 3,
        maxDamage: 3,
        stunTicks: 8,
    },
    {
        // Pollnivian Bandit
        npcIds: [734, 735],
        reqLevel: 55,
        xp: 84.3,
        lootTable: [loot(Items.COINS_995, 50, ALWAYS)],
        coinPouchId: 22532,
        minDamage: 5,
        maxDamage: 5,
        stunTicks: 8,
    },
    {
        // Yanille Watchman (r237 cache-verified)
        npcIds: [5420],
        reqLevel: 65,
        xp: 137.5,
        lootTable: [],
        guaranteedLoot: [loot(Items.COINS_995, 60, ALWAYS), loot(Items.BREAD, 1, ALWAYS)],
        coinPouchId: 22533,
        minDamage: 3,
        maxDamage: 3,
        stunTicks: 8,
    },
    {
        // Menaphite Thug
        npcIds: [3550],
        reqLevel: 65,
        xp: 137.5,
        lootTable: [loot(Items.COINS_995, 60, ALWAYS)],
        coinPouchId: 22534,
        minDamage: 5,
        maxDamage: 5,
        stunTicks: 8,
    },
    {
        // Paladin (r237 cache-verified)
        npcIds: [3293, 3294, 8853, 11901, 11930, 11931, 11932, 11933],
        reqLevel: 70,
        xp: 131.8,
        lootTable: [],
        guaranteedLoot: [loot(Items.COINS_995, 80, ALWAYS), loot(Items.CHAOS_RUNE, 2, ALWAYS)],
        coinPouchId: 22535,
        minDamage: 3,
        maxDamage: 3,
        stunTicks: 8,
    },
    {
        // Gnome
        npcIds: [5130, 6077, 6078, 6079, 6086, 6087, 6094, 6095, 6096],
        reqLevel: 75,
        xp: 133.3,
        lootTable: [
            loot(52, [2, 4], 56), // Arrow shafts.
            loot(Items.COINS_995, 300, 30),
            loot(Items.EARTH_RUNE, 1, 5),
            loot(Items.GOLD_ORE, 1, 8),
            loot(Items.FIRE_ORB, 1, 2),
            loot(Items.SWAMP_TOAD, 1, 24),
            loot(Items.KING_WORM, 1, 3),
        ],
        coinPouchId: 22536,
        minDamage: 1,
        maxDamage: 1,
        stunTicks: 8,
    },
    {
        // Hero (r237 cache-verified)
        npcIds: [3295, 11934, 11935],
        reqLevel: 80,
        xp: 163.3,
        lootTable: [
            loot(Items.COINS_995, [200, 300], 105),
            loot(Items.DEATH_RUNE, 2, 8),
            loot(Items.BLOOD_RUNE, 1, 5),
            loot(Items.GOLD_ORE, 1, 1),
            loot(Items.JUG_OF_WINE, 1, 6),
            loot(Items.FIRE_ORB, 1, 2),
            loot(Items.DIAMOND, 1, 1),
        ],
        coinPouchId: 22537,
        minDamage: 3,
        maxDamage: 3,
        stunTicks: 10,
    },
    {
        // TzHaar-Hur
        npcIds: [7682, 7683, 7684, 7685, 7686, 7687],
        reqLevel: 90,
        xp: 103.4,
        lootTable: [
            loot(Items.TOKKUL, [3, 7], 182),
            loot(Items.UNCUT_SAPPHIRE, 1, 5),
            loot(Items.UNCUT_EMERALD, 1, 4),
            loot(Items.UNCUT_RUBY, 1, 3),
            loot(Items.UNCUT_DIAMOND, 1, 1),
        ],
        successDamage: { amount: 4, preventedByEquippedItemIds: [1580] },
        minDamage: 4,
        maxDamage: 4,
        stunTicks: 10,
    },
];


// Evidence for existing families is kept in one explicit ID-indexed catalog.
const FAMILY_SOURCES: [number, string, number?, number?][] = [
    [3014, "Man", 180, 240], [3114, "Farmer", 150, 240],
    [2541, "H.A.M. Member", 135, 239], [2540, "H.A.M. Member", 135, 239],
    [3292, "Warrior (Thieving)", 100, 240], [526, "Rogue", 75, 240],
    [2268, "Cave goblin (Dorgesh-Kaan)"], [5730, "Master Farmer", 90, 240],
    [397, "Guard", 50, 240], [3937, "Fremennik citizen"], [736, "Bandit (Pollnivneach)"],
    [690, "Bandit (Bandit Camp)", 50, 240], [3297, "Knight of Ardougne", 50, 240],
    [734, "Bandit (Pollnivneach)"], [5420, "Watchman", 15, 160],
    [3550, "Menaphite Thug", 50, 160], [3293, "Paladin", 40, 170], [5130, "Gnome", 43, 175],
    [3295, "Hero", 39, 160], [7682, "TzHaar-Hur", -200, 200],
];
for (const [id, title, low, high] of FAMILY_SOURCES) {
    const def = PICKPOCKET_NPCS.find(d => d.npcIds.includes(id))!;
    def.displayName ??= title;
    def.requirementEvidence = evidence(title);
    def.lootEvidence = evidence(title);
    def.chanceEvidence = evidence(title, "provisional", "No verified ordinary success curve; generic fallback is tuning only.");
    def.failure = { kind: "stun" };
    def.failureEvidence = evidence(title, "provisional", "Damage from per-NPC Wiki; action-lock ticks retained pending phase timing validation. Failure animation unverified for nonhumans.");
    if (low !== undefined && high !== undefined) Object.assign(def, curve(title, low, high));
}
function annotate(id: number, field: "lootEvidence" | "failureEvidence", title: string, notes: string): void {
    PICKPOCKET_NPCS.find(d => d.npcIds.includes(id))![field] = evidence(title, "provisional", notes);
}
for (const id of [2540, 2541]) {
    annotate(id, "lootEvidence", "H.A.M. Member", "Conditional ordinary table. Separate 1/50 clue/nothing roll and Death to the Dorgeshuun clothing override need runtime support.");
    PICKPOCKET_NPCS.find(d => d.npcIds.includes(id))!.failure = {
        kind: "relocate", chance: 1, threshold: 3, counterKey: "ham-concussion",
        avoidance: { skillId: 16, lowChance: 0, highChance: 254 },
        destinations: [{ x: 3186, y: 3211, level: 0 }],
        resetArea: { minX: 3136, maxX: 3199, minY: 9600, maxY: 9663, level: 0 },
        message: "You're beaten unconscious and bundled out of the H.A.M. hideout.",
    };
    annotate(id, "failureEvidence", "H.A.M. Member", "Three concussions; Wiki Agility 0/254 chart. PROVISIONAL single documented outside destination 3186,3211; no jail split/clothing mitigation. Reset bounds are inferred from hideout map region, not verified OSRS code. Chance 1 is conditional on the third concussion, not every failure.");
}
annotate(2268, "lootEvidence", "Cave goblin (Dorgesh-Kaan)", "Base 20-slot table; elite Lumbridge diary wire doubling not yet represented.");
annotate(2268, "failureEvidence", "Guard (Cave goblin)", "Guards 2316/2317 MAY attack. Probability and radius unverified, so no fabricated always-alert policy.");
annotate(5730, "lootEvidence", "Master Farmer", "45 seed types. Rounded Wiki level-85 Farming rates normalized as weights; Farming scaling and tertiary rolls unsupported.");
annotate(3293, "lootEvidence", "Paladin", "Both guaranteed rewards verified; independent hard clue (approximately 1/500) and Rocky rolls unsupported.");
annotate(5130, "lootEvidence", "Gnome", "128-slot main table verified; independent medium clue (1/150) and Rocky rolls unsupported.");
annotate(3295, "lootEvidence", "Hero", "128-slot main table verified; independent elite clue was 1/1200 at r237, 1/900 since 2026-08-19; pet roll unsupported.");
annotate(3550, "lootEvidence", "Menaphite Thug", "Awake pickpocket. Ordinary curve is 50/160; 78/240 is knockout, not ordinary pickpocket.");
for (const id of [734, 736]) annotate(id, "lootEvidence", "Bandit (Pollnivneach)", "Awake pickpocket only. Knockout uses direct coins and a different roll.");
annotate(7682, "failureEvidence", "TzHaar-Hur", "Without ice gloves every attempt deals 4 damage; with gloves only failure. Ten stun ticks. Inner-area cape access belongs to entrance integration. Failure animation and chat unverified; no guard-call evidence.");

const SIMPLE_CIVILIANS: [string, number[]][] = [
    ["Drunken man", [3263]], ["Cuffs", [3279]], ["Narf", [3280]], ["Rusty", [3281]],
    ["Jeff", [3282]], ["Hengel", [3284]], ["Anja", [3285]],
    ["Tourist", range(13206, 13211)], ["Salvager", [13971, 13972, 13973, 13975, 13976, 13977]],
    ["Citizen (Aldarin)", range(13883, 13901)], ["Citizen (Auburnvale)", range(14646, 14653)],
    ["Citizen (Kastori)", range(14741, 14748)], ["Citizen (Tal Teklan)", range(14763, 14770)],
];
for (const [name, ids] of SIMPLE_CIVILIANS) {
    PICKPOCKET_NPCS.push(profile(name, ids, 1, 8, 1, [loot(995, 3, 1)], name, { coinPouchId: 22521,
        ...(["Tourist", "Salvager"].includes(name) ? curve(name, 180, 240) : {}) }));
}
const ELF_LOOT = [loot(995, [280, 350], 105), loot(560, 2, 8), loot(561, 3, 5),
    loot(1993, 1, 6), loot(1601, 1, 1), loot(569, 1, 2), loot(444, 1, 1)];
PICKPOCKET_NPCS.push(
    profile("Citizen (Civitas illa Fortis)", [...range(13164, 13173), ...range(13178, 13187), ...range(13192, 13201)], 1, 8, 1,
        [loot(995, 3, 1)], "Citizen (Civitas illa Fortis)", { coinPouchId: 22521, ...curve("Citizen (Civitas illa Fortis)", 180, 240),
            lootEvidence: evidence("Citizen (Civitas illa Fortis)", "provisional", "Ordinary coins verified; conditional red-token reward not implemented.") }),
    profile("Knight of Varlamore", range(13114, 13119), 55, 84.3, 3, [loot(995, 50, 1)], "Knight of Varlamore", { coinPouchId: 22531 }),
    profile("Pirate", range(14933, 14937), 60, 72, 3,
        [loot(995, 20, 170), loot(31906, 1, 14), loot(31908, 1, 10), loot(2, 1, 5), loot(31511, 1, 1)], "Pirate (Thieving)", {
            coinPouchId: 32895, lootEvidence: evidence("Pirate (Thieving)", "provisional", "Main table verified. Onyx Crest-only 1/10 medallion fragment needs location condition; Sailing 47 is an access requirement.") }),
    profile("Vyre", range(9685, 9714), 82, 306.9, 5,
        [loot(995, [230, 315], 109), loot(560, 2, 8), loot(565, 4, 2), loot(24774, 1, 6), loot(1619, 1, 5), loot(1601, 1, 1), loot(24785, 1, 1)], "Vyre", {
            coinPouchId: 24703, stunTicks: 10, ...curve("Vyre", 8, 128),
            lootEvidence: evidence("Vyre", "provisional", "132-slot ordinary table verified. Separate blood shard 24777 roll at 1/5000 not implemented; Sins of the Father access belongs to area integration.") }),
    profile("Elf (Lletya)", [5297, 5299, 5300], 85, 353.3, 5, ELF_LOOT, "Elf (Thieving)", {
        coinPouchId: 22538, stunTicks: 10, ...curve("Elf (Thieving)", 6, 100),
        requirementEvidence: evidence("Elf (Thieving)", "provisional", "Level verified. Mourning's End Part I STARTED access belongs to area integration, not a completion gate here.") }),
    profile("Elf (Prifddinas)", [9015, ...range(9054, 9090), ...range(9106, 9117)], 85, 353.3, 5, ELF_LOOT, "Elf (Thieving)", {
        coinPouchId: 22538, stunTicks: 10, ...curve("Elf (Thieving)", 6, 100),
        requirementEvidence: evidence("Elf (Thieving)", "provisional", "Level verified; Song of the Elves completion belongs to area integration."),
        lootEvidence: evidence("Elf (Thieving)", "provisional", "Before ordinary loot: crystal shard 23962 at 1/35 and enhanced crystal teleport seed 23959 at 1/1024. Rare pre-roll integration remains; do not flatten into equal weights.") }),
    profile("Wealthy citizen", range(13302, 13305), 50, 96, 3,
        [loot(995, 85, 79), loot(29325, 1, 5), loot(2677, 1, 1)], "Wealthy citizen", {
            coinPouchId: 28822, stunTicks: 6, ...curve("Wealthy citizen", 35, 200),
            lootEvidence: evidence("Wealthy citizen", "provisional", "Ordinary Wiki approximate 79:5:1 coins/house keys/easy clue. Distraction (100% automatic theft), inventory and clue ownership exceptions remain external integrations.") }),
    unsupported("Villager (The Feud)", range(3552, 3560), "Villager", "Quest phases alternate ordinary theft, distraction and knockout; post-quest only blackjack, zero pickpocket XP.", 30, 8),
    unsupported("Dr Fenkenstrain", [1269], "Dr Fenkenstrain", "Ring of Charos reclaim depends on quest state, ownership and activation.", 25),
    unsupported("Movario", [2341], "Movario", "Temple of Ikov, While Guthix Sleeps availability, Agility 70 access and pendant ownership gates.", 42),
    unsupported("Zealot", [3611], "Zealot", "Haunted Mine dialogue must reveal key before theft; quest ownership handling."),
    unsupported("Student", [3634], "Student", "Female student returns Teddy after The Dig Site; NOT Digsite workman."),
    unsupported("Twig", [4133], "Twig", "Troll Stronghold cell key 1, quest stage/ownership and waking combat morph.", 30),
    unsupported("Berry", [4134], "Berry", "Troll Stronghold cell key 2, quest stage/ownership and waking combat morph.", 30),
    unsupported("Curator Haig Halen", [5214], "Curator Haig Halen", "Distinct keys for The Golem and Ethically Acquired Antiquities require exact stages and ownership.", 25),
    unsupported("Sigmund", [5322], "Sigmund", "The Lost Tribe key, quest stage and ownership.", 13),
    unsupported("Sandy", [5384], "Sandy", "The Hand in the Sand quest sample.", 17),
    unsupported("Istoria", [11113], "Istoria", "A Kingdom Divided bluish key; quest-only.", 52),
    unsupported("Citizen (Twilight's Promise)", [12929], "Citizen (Twilight's Promise)", "Coins become stolen amulet at a quest stage; disappears after completion.", 1, 8),
    unsupported("Emissary Ascended", [13767, 13768, 13769], "Emissary Ascended", "The Heart of Darkness quest forms; exact reward/gate unverified."),
    unsupported("Head Guard", [11093, 11095, 11097, 11099, 11101, 11103, 11105, 11107], "Head Guard", "Cache Pickpocket but no published thieving table. Do not inherit ordinary Guard behavior by name."),
    unsupported("Priest", [11303, 11305, 11307, 11309, 11311, 11313], "Priest", "Exact variant/quest identity and loot unresolved; not East Ardougne priest 5417."),
    unsupported("'Black-eye'", [3596], "'Black-eye'", "Tower of Life builder: sandwich/clothing behavior unresolved.", 1, 8),
    unsupported("'No fingers'", [3597], "'No fingers'", "Sandwich normally; eligible builder boots use flat 1/4 quest roll unaffected by boosts. Rogue outfit does not double.", 1, 8),
    unsupported("'Gummy'", [3598], "'Gummy'", "Triangle sandwich 6962, 8 XP, 180/240 ordinary curve; rogue outfit must not double loot.", 1, 8),
    unsupported("'The Guns'", [3599], "'The Guns'", "Triangle sandwich 6962, 8 XP, 180/240 ordinary curve; rogue outfit must not double loot.", 1, 8),
);
const ISLE_SUSPECTS: [string, number[]][] = [
    ["Patzi", [13819]], ["Adala", [13823]], ["Constantinius", [13826]],
    ["Cozyac", [13828]], ["Xocotla", [13830]], ["Pavo", [13832]],
];
for (const [name, ids] of ISLE_SUSPECTS) PICKPOCKET_NPCS.push(unsupported(name, ids, name,
    "Death on the Isle evidence/ownership. Constantinius has a post-quest key; Patzi Wiki IDs differ from snapshot.", 34, 10));



/** Exhaustive r237/OpenRS2 cache 2504 parents reaching a Pickpocket option.
 * Targets include non-pickpocket states deliberately; resolve current player morph first.
 * Raw decode provenance is in the NPC audit report. No same-name inference.
 */
export const PICKPOCKET_MORPH_PARENTS: { id: number; varbit: number; varp: number; targets: number[] }[] = [
    {"id":1955,"varbit":-1,"varp":980,"targets":[1269]},
    {"id":1975,"varbit":340,"varp":-1,"targets":[734,735]},
    {"id":1976,"varbit":340,"varp":-1,"targets":[736,737]},
    {"id":2014,"varbit":-1,"varp":399,"targets":[1269]},
    {"id":2015,"varbit":-1,"varp":399,"targets":[1269]},
    {"id":3187,"varbit":10809,"varp":-1,"targets":[2341]},
    {"id":4262,"varbit":9016,"varp":-1,"targets":[8853]},
    {"id":4267,"varbit":9016,"varp":-1,"targets":[8854]},
    {"id":5082,"varbit":9016,"varp":-1,"targets":[11901]},
    {"id":6138,"varbit":340,"varp":-1,"targets":[3549,3550]},
    {"id":6139,"varbit":340,"varp":-1,"targets":[3552,3553,3554]},
    {"id":6140,"varbit":340,"varp":-1,"targets":[3555,3556,3557]},
    {"id":6141,"varbit":340,"varp":-1,"targets":[3558,3559,3560]},
    {"id":6256,"varbit":9016,"varp":-1,"targets":[11902]},
    {"id":6288,"varbit":532,"varp":-1,"targets":[5322]},
    {"id":6289,"varbit":540,"varp":-1,"targets":[5322]},
    {"id":6405,"varbit":1535,"varp":-1,"targets":[5384]},
    {"id":6819,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":6820,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":6821,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":6822,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":7210,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":7211,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":7547,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":8516,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":8734,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":8740,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9234,"varbit":9035,"varp":-1,"targets":[9015]},
    {"id":9384,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9385,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9386,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9387,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9388,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9389,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9390,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9391,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9392,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9393,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9394,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9395,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9396,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":9397,"varbit":3075,"varp":-1,"targets":[3106]},
    {"id":11151,"varbit":12296,"varp":-1,"targets":[11112,11113]},
    {"id":11392,"varbit":13599,"varp":-1,"targets":[11302,11303]},
    {"id":11393,"varbit":13599,"varp":-1,"targets":[11304,11305]},
    {"id":11394,"varbit":13599,"varp":-1,"targets":[11306,11307]},
    {"id":11395,"varbit":13599,"varp":-1,"targets":[11308,11309]},
    {"id":11396,"varbit":13599,"varp":-1,"targets":[11310,11311]},
    {"id":11397,"varbit":13599,"varp":-1,"targets":[11312,11313]},
    {"id":13399,"varbit":9649,"varp":-1,"targets":[12929]},
    {"id":14066,"varbit":11210,"varp":-1,"targets":[13818,13819]},
    {"id":14070,"varbit":11210,"varp":-1,"targets":[13820,13823]},
    {"id":14073,"varbit":11210,"varp":-1,"targets":[13825,13826]},
    {"id":14076,"varbit":11210,"varp":-1,"targets":[13827,13828]},
    {"id":14079,"varbit":11210,"varp":-1,"targets":[13829,13830]},
    {"id":14083,"varbit":11210,"varp":-1,"targets":[13831,13832]},
    {"id":15088,"varbit":3075,"varp":-1,"targets":[3106]},
];
// 1955 uniquely also has its own literal Pickpocket option, despite a null name.
// Other parents are handled by the runtime's player-specific morph fallback, not aliases.
PICKPOCKET_NPCS.push(unsupported("Dr Fenkenstrain (conditional parent)", [1955], "Dr Fenkenstrain",
    "Raw r237 varp 980 parent: resolve active 1269 child and preserve ring ownership/quest gate; never reward an unresolved parent.", 25));

// Build a fast NPC ID -> definition lookup.
const npcIdToPickpocketDef = new Map<number, PickpocketNpcDef>();
for (const def of PICKPOCKET_NPCS) {
    for (const id of def.npcIds) {
        if (npcIdToPickpocketDef.has(id)) throw new Error(`Duplicate pickpocket NPC ${id}`);
        npcIdToPickpocketDef.set(id, def);
    }
}

// -- Coin pouch definitions --
// Maps pouch item ID -> [minCoins, maxCoins] per open.
export const COIN_POUCH_VALUES: Record<number, [number, number]> = {
    // Verified Coin pouch variants, including the previously omitted HAM/cave goblin.
    22521: [3, 3], 22522: [9, 9], 22523: [1, 21], 22524: [18, 18], 22525: [25, 40],
    22526: [10, 50], 22527: [30, 30], 22528: [40, 40], 22529: [40, 40], 22530: [30, 30],
    22531: [50, 50], 22532: [50, 50], 22533: [60, 60], 22534: [60, 60], 22535: [80, 80],
    22536: [300, 300], 22537: [200, 300], 22538: [280, 350], 24703: [230, 315],
    28822: [85, 85], 32895: [20, 20],
};

export const COIN_POUCH_IDS = new Set(Object.keys(COIN_POUCH_VALUES).map(Number));
export const MAX_COIN_POUCHES = 28;

export { npcIdToPickpocketDef, PICKPOCKET_NPCS };
