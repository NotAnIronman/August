import type { DiaryAreaTasks } from "../types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/11")
// will be wrong.
export const kandarinDiaryTasks: DiaryAreaTasks = {
    areaName: "Kandarin",
    easy: { tasks: [
        { description: "Catch a Mackerel at Catherby." },
        { description: "Buy a candle from the Chandler in Catherby." },
        { description: "Collect five Flax from the Seers' flax fields." },
        { description: "Play the Organ in Seers' church." },
        { description: "Plant some Jute seeds in the patch north of McGrubor's Wood." },
        { description: "Have Galahad make you a cup of tea." },
        { description: "Defeat one of each Elemental in the Elemental Workshop." },
        { description: "Get a pet fish from Harry in Catherby." },
        { description: "Buy a Stew from the Seers' pub (Forester's Arms)." },
        { description: "Speak to Sherlock." },
        { description: "Cross the Coal truck log shortcut." },
    ] },
    medium: { tasks: [
        { description: "Complete a lap of the Barbarian agility course." },
        { description: "Create a Super Antipoison potion from scratch in the Seers/Catherby area." },
        { description: "Enter the Ranging Guild." },
        { description: "Use the grapple shortcut to get from the water obelisk to Catherby shore." },
        { description: "Catch and cook a Bass in Catherby." },
        { description: "Teleport to Camelot." },
        { description: "String a Maple shortbow in Seers' Village bank." },
        { description: "Pick some Limpwurt root from the farming patch in Catherby." },
        { description: "Create a Mind helmet." },
        { description: "Kill a Fire Giant inside the Baxtorian Waterfall dungeon." },
        { description: "Complete a wave of Barbarian Assault." },
        { description: "Steal from the chest in Hemenster." },
        { description: "Travel to McGrubor's Wood by Fairy Ring." },
        { description: "Mine some coal near the coal trucks." },
    ] },
    hard: { tasks: [
        { description: "Catch a Leaping Sturgeon." },
        { description: "Complete a lap of the Seers' Village Rooftop agility course." },
        { description: "Create a Yew longbow from scratch around Seers' Village." },
        { description: "Enter the Seers' Village courthouse with Piety turned on." },
        { description: "Charge a Water Orb." },
        { description: "Burn some Maple logs with a bow in Seers' Village." },
        { description: "Kill a Shadow Hound in the Shadow dungeon." },
        { description: "Kill a Mithril Dragon." },
        { description: "Purchase and equip a granite body from Barbarian Assault." },
        { description: "Have the Seers' estate agent decorate your house with Fancy Stone." },
        { description: "Smith an Adamant spear at Otto's Grotto." },
    ] },
    elite: { tasks: [
        { description: "Read the Blackboard at Barbarian Assault after reaching level 5 in every role." },
        { description: "Pick some Dwarf weed from the herb patch at Catherby." },
        { description: "Fish and cook 5 Sharks in Catherby using the Cooking gauntlets." },
        { description: "Mix a Stamina mix on top of the Seers' Village bank." },
        { description: "Smith a Rune hasta at Otto's Grotto." },
        { description: "Construct a Pyre ship from Magic logs." },
        { description: "Teleport to Catherby." },
    ] },
};
