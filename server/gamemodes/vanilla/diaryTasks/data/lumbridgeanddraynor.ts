import type { DiaryAreaTasks } from "../types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/12")
// will be wrong.
export const lumbridgeAndDraynorDiaryTasks: DiaryAreaTasks = {
    areaName: "Lumbridge & Draynor",
    easy: { tasks: [
        { description: "Complete a lap of the Draynor Village rooftop agility course." },
        { description: "Slay a Cave bug beneath Lumbridge Swamp." },
        { description: "Have Sedridor teleport you to the Rune essence mine." },
        { description: "Craft some water runes from Essence." },
        { description: "Learn your age from Hans in Lumbridge." },
        { description: "Pickpocket a man or woman in Lumbridge." },
        { description: "Chop and burn some oak logs in Lumbridge." },
        { description: "Kill a Zombie in Draynor Sewers." },
        { description: "Catch some Anchovies in Al Kharid." },
        { description: "Bake some Bread on the Lumbridge kitchen range." },
        { description: "Mine some Iron ore at the Al Kharid mine." },
        { description: "Enter the H.A.M. Hideout." },
    ] },
    medium: { tasks: [
        { description: "Complete a lap of the Al Kharid rooftop agility course." },
        { description: "Grapple across the River Lum." },
        { description: "Purchase an upgraded device (Ava's accumulator) from Ava." },
        { description: "Travel to the Wizards' Tower by Fairy ring." },
        { description: "Cast the Teleport to Lumbridge spell." },
        { description: "Catch some Salmon in Lumbridge." },
        { description: "Craft a coif in the Lumbridge cow pen." },
        { description: "Chop some willow logs in Draynor Village." },
        { description: "Pickpocket Martin the Master Gardener." },
        { description: "Get a slayer task from Chaeldar." },
        { description: "Catch an Essence or Eclectic impling in Puro-Puro." },
        { description: "Craft some Lava runes at the fire altar in Al Kharid." },
    ] },
    hard: { tasks: [
        { description: "Cast Bones to Peaches in Al Kharid palace." },
        { description: "Squeeze past the jutting wall on your way to the cosmic altar." },
        { description: "Craft 56 Cosmic runes simultaneously from Essence without the use of Extracts." },
        { description: "Travel from Lumbridge to Edgeville on a Waka Canoe." },
        { description: "Collect at least 100 Tears of Guthix in one visit." },
        { description: "Take the train from Dorgesh-Kaan to Keldagrim." },
        { description: "Purchase some Barrows gloves from the Culinaromancer's Chest." },
        { description: "Pick some Belladonna from the farming patch at Draynor Manor." },
        { description: "Light your mining helmet in the Lumbridge castle basement." },
        { description: "Recharge your prayer at Emir's Arena with Smite activated." },
        { description: "Craft, string and enchant an Amulet of Power in Lumbridge." },
    ] },
    elite: { tasks: [
        { description: "Steal from a Dorgesh-Kaan rich chest." },
        { description: "Grapple across a pylon on the Dorgesh-Kaan Agility Course." },
        { description: "Chop some magic logs at the Mage Training Arena." },
        { description: "Smith an Adamant platebody in Draynor sewer." },
        { description: "140 or more Water runes simultaneously from Essence without the use of Extracts." },
        { description: "Perform the Quest cape emote in the Wise Old Man's house." },
    ] },
};
