import type { DiaryAreaTasks } from "../types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/10")
// will be wrong.
export const fremennikDiaryTasks: DiaryAreaTasks = {
    areaName: "Fremennik",
    easy: { tasks: [
        { description: "Catch a Cerulean twitch." },
        { description: "Change your boots at Yrsa's Shoe Store." },
        { description: "Kill 5 Rock crabs." },
        { description: "Craft a tiara from scratch in Rellekka." },
        { description: "Browse the Stonemasons shop." },
        { description: "Collect 5 Snape grass on Waterbirth Island." },
        { description: "Steal from the Keldagrim crafting or baker's stall." },
        { description: "Fill a bucket with water at the Rellekka well." },
        { description: "Enter the Troll Stronghold." },
        { description: "Chop and burn some oak logs in the Fremennik Province." },
    ] },
    medium: { tasks: [
        { description: "Slay a Brine rat." },
        { description: "Travel to the Snowy Hunter Area via Eagle." },
        { description: "Mine some coal in Rellekka." },
        { description: "Steal from the Rellekka Fish stalls." },
        { description: "Travel to Miscellania by Fairy ring." },
        { description: "Catch a Snowy knight." },
        { description: "Pick up your Pet Rock from your POH Menagerie." },
        { description: "Visit the Lighthouse from Waterbirth Island." },
        { description: "Mine some gold at the Arzinian mine." },
    ] },
    hard: { tasks: [
        { description: "Teleport to Trollheim." },
        { description: "Catch a Sabre-toothed Kyatt." },
        { description: "Mix a super defence potion in the Fremennik Province." },
        { description: "Steal from the Keldagrim Gem stall." },
        { description: "Craft a Neitiznot shield on Neitiznot." },
        { description: "Mine 5 Adamantite ores on Jatizso." },
        { description: "Obtain 100% support from your kingdom subjects." },
        { description: "Teleport to Waterbirth Island." },
        { description: "Obtain the Blast Furnace Foreman's permission to use the Blast Furnace for free." },
    ] },
    elite: { tasks: [
        { description: "Kill each of the Dagannoth Kings." },
        { description: "Craft 56 astral runes simultaneously from Essence without the use of Extracts." },
        { description: "Create a dragonstone amulet in the Neitiznot furnace." },
        { description: "Complete a lap of the Rellekka agility course." },
        { description: "Kill the generals of Armadyl, Bandos, Saradomin and Zamorak in the God Wars Dungeon." },
        { description: "Slay a Spiritual mage within the Godwars Dungeon." },
    ] },
};
