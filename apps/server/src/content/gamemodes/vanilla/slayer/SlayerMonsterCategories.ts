import { getCategoryKeysForNpcId, getNpcIdsForCategory } from "@server/content/gamemodes/vanilla/slayer/SlayerNpcCategoryMap";
import type { SlayerCategoryDefinition } from "@server/content/gamemodes/vanilla/slayer/types";

/**
 * Slayer monster categories — display info, level/xp only.
 *
 * `monsterNames` here is documentation/reference ONLY (helps a human find
 * candidate npcIds to add), never consulted at runtime for matching. Which
 * npcIds actually count toward a category is entirely decided by
 * SlayerNpcCategoryMap.ts's authored npcId -> categoryKey table — see that
 * file for why name-based matching was dropped (short version: which
 * monsters count toward which task is a server design decision, e.g. this
 * server counts Tstanon Karlak and demonic gorillas toward "black_demons",
 * which no name-matching scheme could ever infer).
 *
 * slayerLevelRequired/xpPerKill are the standard OSRS values. A handful of
 * categories are quest-gated in real OSRS (e.g. Basilisks need Elemental
 * Workshop I, Turoth/Kurask need a leaf-bladed weapon, Aberrant Spectres
 * need a nose peg or better). Those prerequisites are NOT enforced yet —
 * flagged below with `note` — and are a good follow-up once quest/equipment
 * gating is wired the same way task assignment is.
 */
export const SLAYER_CATEGORIES: readonly SlayerCategoryDefinition[] = [
    { key: "banshees", displayName: "banshees", monsterNames: ["Banshee"], slayerLevelRequired: 15, xpPerKill: 80, locationHint: "Slayer Tower, level 2." },
    { key: "bats", displayName: "bats", monsterNames: ["Giant bat"], slayerLevelRequired: 0, xpPerKill: 21 },
    { key: "bears", displayName: "bears", monsterNames: ["Black bear", "Grizzly bear"], slayerLevelRequired: 0, xpPerKill: 25 },
    { key: "birds", displayName: "birds", monsterNames: ["Chicken", "Crow", "Seagull"], slayerLevelRequired: 0, xpPerKill: 6 },
    { key: "cave_bugs", displayName: "cave bugs", monsterNames: ["Cave bug"], slayerLevelRequired: 7, xpPerKill: 20 },
    { key: "cave_crawlers", displayName: "cave crawlers", monsterNames: ["Cave crawler"], slayerLevelRequired: 10, xpPerKill: 26 },
    { key: "cave_slimes", displayName: "cave slimes", monsterNames: ["Cave slime"], slayerLevelRequired: 17, xpPerKill: 60 },
    { key: "cows", displayName: "cows", monsterNames: ["Cow", "Cow calf"], slayerLevelRequired: 0, xpPerKill: 4 },
    { key: "crawling_hands", displayName: "crawling hands", monsterNames: ["Crawling hand"], slayerLevelRequired: 5, xpPerKill: 17 },
    { key: "dogs", displayName: "dogs", monsterNames: ["Guard dog", "Terrier"], slayerLevelRequired: 0, xpPerKill: 20 },
    { key: "dwarves", displayName: "dwarves", monsterNames: ["Dwarf"], slayerLevelRequired: 0, xpPerKill: 20 },
    { key: "ghosts", displayName: "ghosts", monsterNames: ["Ghost"], slayerLevelRequired: 0, xpPerKill: 13 },
    { key: "goblins", displayName: "goblins", monsterNames: ["Goblin"], slayerLevelRequired: 0, xpPerKill: 5 },
    { key: "icefiends", displayName: "icefiends", monsterNames: ["Icefiend"], slayerLevelRequired: 0, xpPerKill: 15 },
    { key: "kalphites", displayName: "kalphites", monsterNames: ["Kalphite Worker", "Kalphite Soldier", "Kalphite Guardian"], slayerLevelRequired: 0, xpPerKill: 25 },
    { key: "minotaurs", displayName: "minotaurs", monsterNames: ["Minotaur"], slayerLevelRequired: 0, xpPerKill: 26 },
    { key: "monkeys", displayName: "monkeys", monsterNames: ["Monkey"], slayerLevelRequired: 0, xpPerKill: 3 },
    { key: "rats", displayName: "rats", monsterNames: ["Rat", "Giant rat"], slayerLevelRequired: 0, xpPerKill: 3 },
    { key: "scorpions", displayName: "scorpions", monsterNames: ["Scorpion"], slayerLevelRequired: 0, xpPerKill: 33 },
    { key: "skeletons", displayName: "skeletons", monsterNames: ["Skeleton"], slayerLevelRequired: 0, xpPerKill: 4 },
    { key: "spiders", displayName: "spiders", monsterNames: ["Giant spider"], slayerLevelRequired: 0, xpPerKill: 15 },
    { key: "wolves", displayName: "wolves", monsterNames: ["Wolf"], slayerLevelRequired: 0, xpPerKill: 18 },
    { key: "zombies", displayName: "zombies", monsterNames: ["Zombie"], slayerLevelRequired: 0, xpPerKill: 12 },
    { key: "ogres", displayName: "ogres", monsterNames: ["Ogre"], slayerLevelRequired: 0, xpPerKill: 40 },
    { key: "pyrefiends", displayName: "pyrefiends", monsterNames: ["Pyrefiend"], slayerLevelRequired: 30, xpPerKill: 68 },
    { key: "rockslugs", displayName: "rockslugs", monsterNames: ["Rockslug"], slayerLevelRequired: 20, xpPerKill: 28 },
    { key: "desert_lizards", displayName: "desert lizards", monsterNames: ["Desert Lizard"], slayerLevelRequired: 22, xpPerKill: 34 },
    { key: "cockatrices", displayName: "cockatrices", monsterNames: ["Cockatrice"], slayerLevelRequired: 25, xpPerKill: 92, note: "Real OSRS requires a mirror shield or basilisk/cockatrice-immune equipment; not enforced yet." },
    { key: "crocodiles", displayName: "crocodiles", monsterNames: ["Crocodile"], slayerLevelRequired: 0, xpPerKill: 28 },
    { key: "earth_warriors", displayName: "earth warriors", monsterNames: ["Earth warrior"], slayerLevelRequired: 0, xpPerKill: 47 },
    { key: "hill_giants", displayName: "hill giants", monsterNames: ["Hill Giant"], slayerLevelRequired: 0, xpPerKill: 22 },
    { key: "hobgoblins", displayName: "hobgoblins", monsterNames: ["Hobgoblin"], slayerLevelRequired: 0, xpPerKill: 32 },
    { key: "ice_giants", displayName: "ice giants", monsterNames: ["Ice giant"], slayerLevelRequired: 0, xpPerKill: 53 },
    { key: "ice_warriors", displayName: "ice warriors", monsterNames: ["Ice warrior"], slayerLevelRequired: 0, xpPerKill: 47 },
    { key: "moss_giants", displayName: "moss giants", monsterNames: ["Moss giant"], slayerLevelRequired: 0, xpPerKill: 50 },
    { key: "black_knights", displayName: "Black Knights", monsterNames: ["Black Knight"], slayerLevelRequired: 0, xpPerKill: 24 },
    { key: "lesser_demons", displayName: "lesser demons", monsterNames: ["Lesser demon"], slayerLevelRequired: 0, xpPerKill: 59 },
    { key: "green_dragons", displayName: "green dragons", monsterNames: ["Green dragon", "Brutal green dragon"], slayerLevelRequired: 0, xpPerKill: 65 },
    { key: "hellhounds", displayName: "hellhounds", monsterNames: ["Hellhound"], slayerLevelRequired: 0, xpPerKill: 124 },
    { key: "fire_giants", displayName: "fire giants", monsterNames: ["Fire giant"], slayerLevelRequired: 0, xpPerKill: 133 },
    { key: "greater_demons", displayName: "greater demons", monsterNames: ["Greater demon"], slayerLevelRequired: 0, xpPerKill: 87 },
    { key: "black_demons", displayName: "black demons", monsterNames: ["Black demon"], slayerLevelRequired: 0, xpPerKill: 220 },
    { key: "blue_dragons", displayName: "blue dragons", monsterNames: ["Blue dragon", "Baby blue dragon"], slayerLevelRequired: 0, xpPerKill: 340 },
    { key: "red_dragons", displayName: "red dragons", monsterNames: ["Red dragon", "Baby red dragon"], slayerLevelRequired: 0, xpPerKill: 65 },
    { key: "rock_crabs", displayName: "rock crabs", monsterNames: ["Rock Crab"], slayerLevelRequired: 0, xpPerKill: 27 },
    { key: "ghouls", displayName: "ghouls", monsterNames: ["Ghoul"], slayerLevelRequired: 0, xpPerKill: 33 },
    { key: "harpie_bug_swarms", displayName: "harpie bug swarms", monsterNames: ["Harpie Bug Swarm"], slayerLevelRequired: 33, xpPerKill: 65 },
    { key: "infernal_mages", displayName: "infernal mages", monsterNames: ["Infernal Mage"], slayerLevelRequired: 45, xpPerKill: 43 },
    { key: "molanisks", displayName: "molanisks", monsterNames: ["Molanisk"], slayerLevelRequired: 39, xpPerKill: 43 },
    { key: "basilisks", displayName: "basilisks", monsterNames: ["Basilisk"], slayerLevelRequired: 40, xpPerKill: 79, note: "Real OSRS requires a mirror shield; not enforced yet." },
    { key: "jellies", displayName: "jellies", monsterNames: ["Jelly"], slayerLevelRequired: 52, xpPerKill: 50 },
    { key: "turoth", displayName: "turoth", monsterNames: ["Turoth"], slayerLevelRequired: 55, xpPerKill: 96, note: "Real OSRS requires a leaf-bladed weapon; not enforced yet." },
    { key: "bloodveld", displayName: "bloodveld", monsterNames: ["Bloodveld", "Insatiable bloodveld"], slayerLevelRequired: 50, xpPerKill: 76 },
    { key: "cave_horrors", displayName: "cave horrors", monsterNames: ["Cave horror"], slayerLevelRequired: 58, xpPerKill: 240, note: "Real OSRS requires the Cabin Fever miniquest and an ivandis flail/silver equivalent; not enforced yet." },
    { key: "aberrant_spectres", displayName: "aberrant spectres", monsterNames: ["Aberrant spectre"], slayerLevelRequired: 60, xpPerKill: 93, note: "Real OSRS requires a nose peg or slayer helmet; not enforced yet." },
    { key: "dust_devils", displayName: "dust devils", monsterNames: ["Dust devil"], slayerLevelRequired: 65, xpPerKill: 66, note: "Real OSRS requires Desert Treasure; not enforced yet." },
    { key: "kurask", displayName: "kurask", monsterNames: ["Kurask"], slayerLevelRequired: 65, xpPerKill: 168, note: "Real OSRS requires a leaf-bladed weapon; not enforced yet." },
    { key: "trolls", displayName: "trolls", monsterNames: ["Mountain troll", "Ice troll male", "Ice troll female"], slayerLevelRequired: 0, xpPerKill: 68 },
    { key: "waterfiends", displayName: "waterfiends", monsterNames: ["Waterfiend"], slayerLevelRequired: 0, xpPerKill: 130 },
    { key: "abyssal_demons", displayName: "abyssal demons", monsterNames: ["Abyssal demon"], slayerLevelRequired: 85, xpPerKill: 150 },
    { key: "nechryael", displayName: "nechryael", monsterNames: ["Nechryael"], slayerLevelRequired: 80, xpPerKill: 175 },
    { key: "dark_beasts", displayName: "dark beasts", monsterNames: ["Dark beast"], slayerLevelRequired: 90, xpPerKill: 240 },
    { key: "gargoyles", displayName: "gargoyles", monsterNames: ["Gargoyle"], slayerLevelRequired: 75, xpPerKill: 105, note: "Real OSRS requires a crush weapon to finish the kill; not enforced yet." },
    { key: "mutated_zygomites", displayName: "mutated zygomites", monsterNames: ["Mutated zygomite"], slayerLevelRequired: 57, xpPerKill: 168, note: "Real OSRS requires fungicide-sprayed weapon; not enforced yet." },
    { key: "tzhaar", displayName: "TzHaar", monsterNames: ["TzHaar-Ket", "TzHaar-Xil", "TzHaar-Hur", "TzHaar-Mej"], slayerLevelRequired: 0, xpPerKill: 90 },
    { key: "vampyres", displayName: "vampyres", monsterNames: ["Vampyre"], slayerLevelRequired: 0, xpPerKill: 76 },
    { key: "werewolves", displayName: "werewolves", monsterNames: ["Werewolf"], slayerLevelRequired: 0, xpPerKill: 51, note: "Real OSRS requires Priest in Peril; not enforced yet." },
    { key: "warped_creatures", displayName: "warped creatures", monsterNames: ["Warped Jelly"], slayerLevelRequired: 0, xpPerKill: 82 },
    { key: "spiritual_creatures", displayName: "spiritual creatures", monsterNames: ["Spiritual warrior", "Spiritual ranger", "Spiritual mage"], slayerLevelRequired: 63, xpPerKill: 500, locationHint: "God Wars Dungeon.", note: "Real OSRS requires access to the relevant GWD faction room; not enforced yet." },
    { key: "steel_dragons", displayName: "steel dragons", monsterNames: ["Steel dragon"], slayerLevelRequired: 0, xpPerKill: 340 },
    { key: "brine_rats", displayName: "brine rats", monsterNames: ["Brine rat"], slayerLevelRequired: 0, xpPerKill: 45 },
    { key: "wyverns", displayName: "wyverns", monsterNames: ["Long-tailed wyvern", "Spitting Wyvern", "Taloned Wyvern"], slayerLevelRequired: 66, xpPerKill: 700, note: "Real OSRS requires completion of A Tail of Two Cats/Elemental Workshop II; not enforced yet." },
    { key: "revenants", displayName: "revenants", monsterNames: ["Revenant imp", "Revenant goblin", "Revenant pyrefiend", "Revenant hobgoblin", "Revenant cyclops", "Revenant hellhound", "Revenant demon", "Revenant ork", "Revenant dark beast", "Revenant knight", "Revenant dragon"], slayerLevelRequired: 0, xpPerKill: 80, locationHint: "Wilderness only." },
    { key: "chaos_druids", displayName: "chaos druids", monsterNames: ["Chaos druid", "Elder Chaos druid"], slayerLevelRequired: 0, xpPerKill: 30, locationHint: "Wilderness only." },
    { key: "wilderness_black_demons", displayName: "black demons", monsterNames: ["Black demon"], slayerLevelRequired: 0, xpPerKill: 220, locationHint: "Wilderness only." },
] as const;

const categoriesByKey = new Map(SLAYER_CATEGORIES.map((category) => [category.key, category]));

export function getSlayerCategory(key: string): SlayerCategoryDefinition | undefined {
    return categoriesByKey.get(key);
}

/**
 * Live npcTypeIds for a category — reads the authoritative, hand-editable
 * map in SlayerNpcCategoryMap.ts. See that file for how to add/fix entries.
 */
export function getCategoryNpcIds(categoryKey: string): readonly number[] {
    return getNpcIdsForCategory(categoryKey);
}

/** Every category key a given live npcTypeId counts toward (usually zero or one). */
export function getCategoryKeysForNpc(npcTypeId: number): readonly string[] {
    return getCategoryKeysForNpcId(npcTypeId);
}
