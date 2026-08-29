import type { DiaryAreaTasks } from "@server/content/gamemodes/vanilla/diary-tasks/types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/12")
// will be wrong.
export const kourendAndKebosDiaryTasks: DiaryAreaTasks = {
    areaName: "Kourend & Kebos",
    easy: { tasks: [
        { description: "Mine some Iron ore at the Mount Karuulm mine." },
        { description: "Kill a Sand crab." },
        { description: "Hand in a book at the Arceuus Library." },
        { description: "Steal from a Hosidius food stall." },
        { description: "Browse the Warrens General Store." },
        { description: "Take a boat to Land's End." },
        { description: "Pray at the Altar in Kourend Castle." },
        { description: "Dig up some Saltpetre." },
        { description: "Enter your Player Owned House from Hosidius." },
        { description: "Do a lap of either tier of the Shayzien Agility Course." },
        { description: "Create a Strength potion in the Lovakengj pub." },
        { description: "Fish a Trout from the River Molch." },
    ] },
    medium: { tasks: [
        { description: "Travel to the Fairy Ring south of Mount Karuulm." },
        { description: "Kill a Lizardman." },
        { description: "Use Kharedst's memoirs to teleport to all five cities in Great Kourend." },
        { description: "Mine some Volcanic Sulphur." },
        { description: "Enter the Farming Guild." },
        { description: "Switch to the Necromancy Spellbook at Tyss." },
        { description: "Repair a Piscarilius crane." },
        { description: "Deliver some intelligence to Captain Ginea." },
        { description: "Catch a Bluegill on Molch Island." },
        { description: "Use the boulder leap shortcut in the Arceuus essence mine." },
        { description: "Subdue the Wintertodt." },
        { description: "Catch a Chinchompa in the Kourend Woodland." },
        { description: "Chop some Mahogany logs north of the Farming Guild." },
    ] },
    hard: { tasks: [
        { description: "Enter the Woodcutting Guild." },
        { description: "Smelt an Adamantite bar in The Forsaken Tower." },
        { description: "Kill a Lizardman Shaman in the Lizardman Temple." },
        { description: "Mine some Lovakite." },
        { description: "Plant some Logavano seeds at the Tithe Farm." },
        { description: "Kill a Zombie in the Shayzien Crypts." },
        { description: "Teleport to Xeric's Heart using Xeric's Talisman." },
        { description: "Deliver an artefact to Captain Khaled." },
        { description: "Kill a Wyrm in the Karuulm Slayer Dungeon." },
        { description: "Cast Monster Examine on a Troll south of Mount Quidamortem." },
    ] },
    elite: { tasks: [
        { description: "Craft one or more Blood runes from Dark essence." },
        { description: "Chop some Redwood logs." },
        { description: "Defeat Skotizo in the Catacombs of Kourend." },
        { description: "Catch an Anglerfish and cook it whilst in Great Kourend." },
        { description: "Kill a Hydra in the Karuulm Slayer Dungeon." },
        { description: "Create an Ape Atoll teleport tablet." },
        { description: "Complete a raid in the Chambers of Xeric." },
        { description: "Create your own Battlestaff from scratch within the Farming Guild." },
    ] },
};
