import type { SlayerMasterDefinition, SlayerMasterTaskEntry } from "@server/content/gamemodes/vanilla/slayer/types";

/**
 * Slayer master task tables.
 *
 * npcIds below reflect what the person confirmed is actually placed and
 * talkable in their running world (verified 2024 test pass), NOT the
 * (differing, in Nieve's case) ids found in this branch's checked-in
 * data/generated/server/npc-spawns.json snapshot. That snapshot lists
 * Turael/Mazchna/Vannaka/Chaeldar/Konar/Duradel/Krystilia at matching
 * ids/coordinates, but only has Nieve as id 1455 at (2465,3490) — the
 * live world instead has her at (2431,3424) as id 6797. Flagging this
 * discrepancy rather than silently picking one: if the live world's data
 * file differs from this checkout, worth reconciling separately so the
 * two don't drift further.
 *
 * Quantities/weights follow the standard OSRS master progression (Turael's
 * roster is the easiest full-clear, Duradel/Krystilia the hardest) but are
 * NOT a byte-exact copy of the wiki's per-master weight table — treat these
 * as a solid, tunable v1. Combat-level gating below is enforced; the
 * quest/equipment prerequisites noted on individual categories in
 * SlayerMonsterCategories.ts are not enforced yet.
 */

function entry(categoryKey: string, weight: number, minAmount: number, maxAmount: number): SlayerMasterTaskEntry {
    return { categoryKey, weight, minAmount, maxAmount };
}

const TURAEL_TASKS: SlayerMasterTaskEntry[] = [
    entry("banshees", 7, 15, 50),
    entry("bats", 8, 15, 50),
    entry("birds", 8, 15, 50),
    entry("cave_bugs", 8, 15, 50),
    entry("cave_crawlers", 8, 15, 50),
    entry("cave_slimes", 7, 15, 50),
    entry("cows", 8, 15, 50),
    entry("crawling_hands", 8, 15, 50),
    entry("dogs", 8, 15, 50),
    entry("dwarves", 8, 15, 50),
    entry("ghosts", 8, 15, 50),
    entry("goblins", 8, 15, 50),
    entry("icefiends", 8, 15, 50),
    entry("kalphites", 8, 15, 50),
    entry("minotaurs", 8, 15, 50),
    entry("monkeys", 8, 15, 50),
    entry("rats", 8, 15, 50),
    entry("scorpions", 8, 15, 50),
    entry("skeletons", 8, 15, 50),
    entry("spiders", 8, 15, 50),
    entry("wolves", 8, 15, 50),
    entry("zombies", 8, 15, 50),
    entry("rockslugs", 7, 15, 50),
    entry("desert_lizards", 7, 15, 50),
    entry("crocodiles", 7, 15, 50),
    entry("pyrefiends", 7, 15, 50),
    entry("ogres", 7, 15, 50),
];

const MAZCHNA_TASKS: SlayerMasterTaskEntry[] = [
    entry("black_knights", 7, 15, 50),
    entry("cave_bugs", 6, 15, 50),
    entry("cave_crawlers", 7, 15, 50),
    entry("cave_slimes", 6, 15, 50),
    entry("cockatrices", 6, 15, 50),
    entry("crawling_hands", 6, 15, 50),
    entry("desert_lizards", 6, 15, 50),
    entry("dwarves", 6, 15, 50),
    entry("earth_warriors", 7, 15, 50),
    entry("ghouls", 7, 15, 50),
    entry("hill_giants", 8, 15, 50),
    entry("hobgoblins", 8, 15, 50),
    entry("ice_warriors", 7, 15, 50),
    entry("icefiends", 6, 15, 50),
    entry("kalphites", 7, 15, 50),
    entry("molanisks", 6, 15, 50),
    entry("moss_giants", 8, 15, 50),
    entry("ogres", 6, 15, 50),
    entry("pyrefiends", 6, 15, 50),
    entry("rockslugs", 6, 15, 50),
    entry("vampyres", 6, 15, 50),
    entry("wolves", 6, 15, 50),
];

const VANNAKA_TASKS: SlayerMasterTaskEntry[] = [
    entry("banshees", 7, 15, 50),
    entry("bats", 6, 15, 50),
    entry("black_knights", 6, 15, 50),
    entry("blue_dragons", 6, 20, 40),
    entry("cave_crawlers", 6, 15, 50),
    entry("cave_slimes", 6, 15, 50),
    entry("cockatrices", 6, 15, 50),
    entry("crawling_hands", 6, 15, 50),
    entry("earth_warriors", 6, 15, 50),
    entry("fire_giants", 8, 15, 90),
    entry("ghouls", 6, 15, 50),
    entry("greater_demons", 7, 15, 90),
    entry("green_dragons", 7, 15, 50),
    entry("hellhounds", 8, 15, 90),
    entry("hill_giants", 6, 15, 50),
    entry("hobgoblins", 6, 15, 50),
    entry("ice_warriors", 6, 15, 50),
    entry("infernal_mages", 6, 15, 50),
    entry("jellies", 6, 15, 50),
    entry("lesser_demons", 7, 15, 90),
    entry("molanisks", 6, 15, 50),
    entry("moss_giants", 6, 15, 50),
    entry("pyrefiends", 6, 15, 50),
    entry("red_dragons", 6, 15, 40),
    entry("rockslugs", 6, 15, 50),
    entry("vampyres", 6, 15, 50),
    entry("black_demons", 7, 15, 90),
    entry("basilisks", 6, 15, 50),
    entry("turoth", 6, 15, 50),
    entry("waterfiends", 6, 15, 80),
];

const CHAELDAR_TASKS: SlayerMasterTaskEntry[] = [
    entry("aberrant_spectres", 7, 10, 60),
    entry("abyssal_demons", 8, 10, 60),
    entry("black_demons", 7, 30, 90),
    entry("black_knights", 4, 15, 50),
    entry("bloodveld", 7, 10, 60),
    entry("blue_dragons", 6, 30, 60),
    entry("brine_rats", 5, 10, 40),
    entry("cave_horrors", 6, 10, 60),
    entry("dust_devils", 7, 10, 60),
    entry("fire_giants", 7, 30, 90),
    entry("gargoyles", 8, 10, 60),
    entry("greater_demons", 7, 30, 90),
    entry("green_dragons", 5, 30, 60),
    entry("hellhounds", 7, 30, 90),
    entry("infernal_mages", 5, 10, 60),
    entry("jellies", 6, 10, 60),
    entry("kalphites", 4, 30, 90),
    entry("kurask", 7, 10, 60),
    entry("lesser_demons", 5, 30, 90),
    entry("molanisks", 4, 10, 60),
    entry("moss_giants", 5, 30, 90),
    entry("mutated_zygomites", 6, 10, 60),
    entry("nechryael", 8, 10, 60),
    entry("pyrefiends", 4, 10, 60),
    entry("red_dragons", 4, 10, 40),
    entry("rockslugs", 4, 10, 60),
    entry("spiritual_creatures", 6, 10, 60),
    entry("steel_dragons", 4, 10, 40),
    entry("trolls", 5, 30, 90),
    entry("turoth", 6, 10, 60),
    entry("tzhaar", 6, 30, 90),
    entry("vampyres", 5, 10, 60),
    entry("warped_creatures", 4, 10, 60),
    entry("waterfiends", 6, 10, 80),
    entry("wyverns", 4, 10, 60),
];

const HIGH_TIER_TASKS: SlayerMasterTaskEntry[] = [
    entry("aberrant_spectres", 7, 60, 120),
    entry("abyssal_demons", 8, 100, 150),
    entry("basilisks", 6, 60, 120),
    entry("black_demons", 7, 100, 150),
    entry("bloodveld", 7, 60, 120),
    entry("blue_dragons", 6, 60, 120),
    entry("cave_horrors", 6, 60, 120),
    entry("dark_beasts", 5, 10, 20),
    entry("dust_devils", 7, 60, 120),
    entry("fire_giants", 7, 100, 150),
    entry("gargoyles", 8, 60, 120),
    entry("greater_demons", 7, 100, 150),
    entry("green_dragons", 5, 60, 120),
    entry("hellhounds", 7, 100, 150),
    entry("jellies", 6, 60, 120),
    entry("kurask", 7, 60, 120),
    entry("mutated_zygomites", 6, 60, 120),
    entry("nechryael", 8, 60, 120),
    entry("red_dragons", 4, 60, 120),
    entry("spiritual_creatures", 6, 60, 120),
    entry("steel_dragons", 4, 30, 60),
    entry("trolls", 5, 100, 150),
    entry("tzhaar", 6, 100, 150),
    entry("vampyres", 5, 60, 120),
    entry("warped_creatures", 4, 60, 120),
    entry("waterfiends", 6, 60, 120),
    entry("wyverns", 4, 60, 110),
];

const KONAR_TASKS: SlayerMasterTaskEntry[] = HIGH_TIER_TASKS;
const NIEVE_TASKS: SlayerMasterTaskEntry[] = HIGH_TIER_TASKS;

const DURADEL_TASKS: SlayerMasterTaskEntry[] = [
    entry("abyssal_demons", 8, 130, 200),
    entry("basilisks", 6, 110, 170),
    entry("black_demons", 7, 130, 200),
    entry("bloodveld", 7, 110, 170),
    entry("blue_dragons", 6, 110, 170),
    entry("cave_horrors", 6, 110, 170),
    entry("dark_beasts", 5, 30, 60),
    entry("dust_devils", 7, 110, 170),
    entry("fire_giants", 7, 130, 200),
    entry("gargoyles", 8, 110, 170),
    entry("greater_demons", 7, 130, 200),
    entry("green_dragons", 5, 110, 170),
    entry("hellhounds", 7, 130, 200),
    entry("jellies", 6, 110, 170),
    entry("kurask", 7, 110, 170),
    entry("mutated_zygomites", 6, 110, 170),
    entry("nechryael", 8, 110, 170),
    entry("red_dragons", 4, 110, 170),
    entry("spiritual_creatures", 6, 110, 170),
    entry("steel_dragons", 4, 60, 90),
    entry("trolls", 5, 130, 200),
    entry("tzhaar", 6, 130, 200),
    entry("vampyres", 5, 110, 170),
    entry("warped_creatures", 4, 110, 170),
    entry("waterfiends", 6, 110, 170),
    entry("wyverns", 4, 100, 150),
];

const KRYSTILIA_TASKS: SlayerMasterTaskEntry[] = [
    entry("revenants", 10, 20, 40),
    entry("chaos_druids", 8, 15, 50),
    entry("wilderness_black_demons", 6, 15, 50),
    entry("green_dragons", 8, 15, 50),
    entry("scorpions", 6, 15, 50),
    entry("spiders", 6, 15, 50),
    entry("skeletons", 6, 15, 50),
    entry("turoth", 6, 15, 50),
];

export const SLAYER_MASTERS: readonly SlayerMasterDefinition[] = [
    { id: "turael", displayName: "Turael", npcIds: [401], combatLevelRequired: 0, pointsPerTask: 8, tasks: TURAEL_TASKS },
    { id: "mazchna", displayName: "Mazchna", npcIds: [402], combatLevelRequired: 20, pointsPerTask: 12, tasks: MAZCHNA_TASKS },
    { id: "vannaka", displayName: "Vannaka", npcIds: [403], combatLevelRequired: 40, pointsPerTask: 12, tasks: VANNAKA_TASKS },
    { id: "chaeldar", displayName: "Chaeldar", npcIds: [404], combatLevelRequired: 70, pointsPerTask: 15, tasks: CHAELDAR_TASKS },
    { id: "konar", displayName: "Konar quo Maten", npcIds: [8623], combatLevelRequired: 75, pointsPerTask: 15, tasks: KONAR_TASKS },
    { id: "nieve", displayName: "Nieve", npcIds: [6797], combatLevelRequired: 85, pointsPerTask: 18, tasks: NIEVE_TASKS },
    { id: "duradel", displayName: "Duradel", npcIds: [405], combatLevelRequired: 100, pointsPerTask: 20, tasks: DURADEL_TASKS },
    { id: "krystilia", displayName: "Krystilia", npcIds: [7663], combatLevelRequired: 0, pointsPerTask: 20, tasks: KRYSTILIA_TASKS },
] as const;

const masterById = new Map(SLAYER_MASTERS.map((master) => [master.id, master]));
const masterByNpcId = new Map(SLAYER_MASTERS.flatMap((master) => master.npcIds.map((npcId) => [npcId, master] as const)));

export function getSlayerMaster(id: string): SlayerMasterDefinition | undefined {
    return masterById.get(id);
}

export function getSlayerMasterByNpcId(npcTypeId: number): SlayerMasterDefinition | undefined {
    return masterByNpcId.get(npcTypeId);
}

export function getAllSlayerMasterNpcIds(): readonly number[] {
    return SLAYER_MASTERS.flatMap((master) => master.npcIds);
}
