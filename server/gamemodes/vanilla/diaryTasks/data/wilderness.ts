import type { DiaryAreaTasks } from "../types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/12")
// will be wrong.
export const wildernessDiaryTasks: DiaryAreaTasks = {
    areaName: "Wilderness",
    easy: { tasks: [
        { description: "Cast Low Alchemy at the Fountain of Rune." },
        { description: "Enter the Wilderness from the Ardougne or Edgeville lever." },
        { description: "Pray at the Chaos Altar in the Western Wilderness." },
        { description: "Enter the Chaos Runecrafting temple." },
        { description: "Kill a Mammoth in the Wilderness." },
        { description: "Kill an Earth Warrior in the Wilderness beneath Edgeville." },
        { description: "Restore some prayer points at the demonic ruins." },
        { description: "Enter the King Black Dragon's lair." },
        { description: "Collect 5 Red spiders' eggs from the Wilderness." },
        { description: "Mine some Iron ore in the Wilderness." },
        { description: "Have the Mage of Zamorak teleport you to the Abyss." },
        { description: "Equip any team cape in the Wilderness." },
    ] },
    medium: { tasks: [
        { description: "Mine some Mithril ore in the Wilderness." },
        { description: "Chop some yew logs from a fallen Ent." },
        { description: "Enter the Wilderness Godwars Dungeon." },
        { description: "Complete a lap of the Wilderness Agility course." },
        { description: "Kill a Green Dragon in the Wilderness." },
        { description: "Kill an Ankou in the Wilderness." },
        { description: "Charge an Earth Orb." },
        { description: "Kill a Bloodveld in the Wilderness Godwars Dungeon." },
        { description: "Talk to the Emblem Trader in Edgeville about emblems." },
        { description: "Smith a Golden helmet in the Resource Area." },
        { description: "Open the Muddy Chest in the lava maze." },
    ] },
    hard: { tasks: [
        { description: "Cast any of the 3 God spells against another player in the Wilderness." },
        { description: "Charge an Air Orb." },
        { description: "Catch a Black Salamander in the Wilderness." },
        { description: "Smith an Adamant scimitar in the Resource Area." },
        { description: "Kill a Lava Dragon." },
        { description: "Kill the Chaos Elemental." },
        { description: "Kill the Crazy Archaeologist, Chaos Fanatic & Scorpia." },
        { description: "Take the agility shortcut from Trollheim into the Wilderness." },
        { description: "Kill a Spiritual warrior in the Wilderness Godwars Dungeon." },
        { description: "Fish some Raw Lava Eel in the Wilderness." },
    ] },
    elite: { tasks: [
        { description: "Kill Callisto, Venenatis & Vet'ion." },
        { description: "Teleport to Ghorrock." },
        { description: "Fish and cook a Dark Crab in the Resource Area." },
        { description: "Smith a rune scimitar from scratch in the Resource Area." },
        { description: "Steal from the Rogues' chest." },
        { description: "Slay a spiritual mage inside the Wilderness Godwars Dungeon." },
        { description: "Cut and burn some magic logs in the Resource Area." },
    ] },
};
