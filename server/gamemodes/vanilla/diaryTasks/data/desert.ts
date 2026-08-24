import type { DiaryAreaTasks } from "../types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/11")
// will be wrong.
export const desertDiaryTasks: DiaryAreaTasks = {
    areaName: "Desert",
    easy: { tasks: [
        { description: "Catch a Golden Warbler." },
        { description: "Mine 5 clay in the north-eastern desert (Uzer mine)." },
        { description: "Enter the Kalphite Hive." },
        { description: "Enter the Desert with a set of Desert robes equipped." },
        { description: "Kill a Vulture." },
        { description: "Have the Nardah Herbalist (Zahur) clean a herb for you." },
        { description: "Collect 5 Potato Cactus from the Kalphite Hive." },
        { description: "Sell some artefacts to Simon Templeton." },
        { description: "Open the Sarcophagus in the first room of Pyramid Plunder." },
        { description: "Cut a desert cactus open to fill a waterskin." },
        { description: "Travel from the Shantay Pass to Pollnivneach by Magic Carpet." },
    ] },
    medium: { tasks: [
        { description: "Climb to the summit of the Agility Pyramid." },
        { description: "Slay a desert lizard." },
        { description: "Catch an Orange Salamander." },
        { description: "Steal a feather from the Desert Phoenix." },
        { description: "Travel to Uzer via Magic Carpet." },
        { description: "Travel to the Desert via Eagle." },
        { description: "Pray at the Elidinis statuette in Nardah." },
        { description: "Create a combat potion in the desert." },
        { description: "Teleport to Enakhra\\" },
        { description: "Visit the Genie." },
        { description: "Teleport to Pollnivneach with a redirected Teleport to House tablet." },
        { description: "Chop some Teak logs near Uzer." },
    ] },
    hard: { tasks: [
        { description: "Knock out and pickpocket a Menaphite Thug." },
        { description: "Mine some Granite." },
        { description: "Refill your waterskins in the Desert using Lunar magic." },
        { description: "Kill the Kalphite Queen." },
        { description: "Complete a lap of the Pollnivneach agility course." },
        { description: "Slay a Dust Devil in the Smoke Dungeon with a Slayer helmet equipped." },
        { description: "Activate Ancient Magicks at the altar in the Jaldraocht Pyramid." },
        { description: "Defeat a Locust Rider with Keris." },
        { description: "Burn some yew logs on the Nardah Mayor\\" },
        { description: "Create a Mithril platebody in Nardah." },
    ] },
    elite: { tasks: [
        { description: "Bake a wild pie at the Nardah Clay Oven." },
        { description: "Cast Ice Barrage against a foe in the Desert." },
        { description: "Fletch some Dragon darts at the Bedabin Camp." },
        { description: "Speak to the KQ head in your POH." },
        { description: "Steal from the Grand Gold Chest in the final room of Pyramid Plunder." },
        { description: "Restore at least 85 Prayer points when praying at the Altar in Sophanem." },
    ] },
};
