import type { DiaryAreaTasks } from "../types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/11")
// will be wrong.
export const westernProvincesDiaryTasks: DiaryAreaTasks = {
    areaName: "Western Provinces",
    easy: { tasks: [
        { description: "Catch a Copper Longtail." },
        { description: "Complete a novice game of Pest Control." },
        { description: "Mine some Iron ore near Piscatoris." },
        { description: "Complete a lap of the Gnome agility course." },
        { description: "Score a goal in a Gnomeball match." },
        { description: "Claim any Chompy bird hat from Rantz." },
        { description: "Teleport to Pest Control using the Minigame Teleport." },
        { description: "Collect a swamp toad at the Gnome Stronghold." },
        { description: "Have Brimstail teleport you to the Essence Mine." },
        { description: "Fletch an Oak shortbow in the Gnome Stronghold." },
        { description: "Kill a Terrorbird in the Terrorbird enclosure." },
    ] },
    medium: { tasks: [
        { description: "Take the agility shortcut from the Grand Tree to Otto's Grotto." },
        { description: "Travel to the Gnome Stronghold by Spirit Tree." },
        { description: "Trap a Spined Larupia." },
        { description: "Fish some Bass on Ape Atoll." },
        { description: "Chop and burn some teak logs on Ape Atoll." },
        { description: "Complete an intermediate game of Pest Control." },
        { description: "Travel to the Feldip Hills by Gnome Glider." },
        { description: "Claim a Chompy bird hat from Rantz after registering at least 125 kills." },
        { description: "Travel from Eagles' Peak to the Feldip Hills by Eagle." },
        { description: "Make a Chocolate Bomb at the Grand Tree." },
        { description: "Complete a delivery for the Gnome Restaurant." },
        { description: "Turn your small crystal seed into a Crystal saw." },
        { description: "Mine some Gold ore underneath the Grand Tree." },
    ] },
    hard: { tasks: [
        { description: "Kill an Elf with a Crystal bow." },
        { description: "Catch and cook a Monkfish in Piscatoris." },
        { description: "Complete a Veteran game of Pest Control." },
        { description: "Catch a Dashing Kebbit." },
        { description: "Complete a lap of the Ape Atoll agility course." },
        { description: "Chop and burn some Mahogany logs on Ape Atoll." },
        { description: "Mine some Adamantite ore in Tirannwn." },
        { description: "Check the health of your Palm tree in Lletya." },
        { description: "Claim a Chompy bird hat from Rantz after registering at least 300 kills." },
        { description: "Build an Isafdar painting in your POH Quest hall." },
        { description: "Kill Zulrah." },
        { description: "Teleport to Ape Atoll." },
        { description: "Pickpocket a Gnome." },
    ] },
    elite: { tasks: [
        { description: "Fletch a Magic longbow in Tirannwn." },
        { description: "Kill the Thermonuclear Smoke Devil." },
        { description: "Have Prissy Scilla protect your Magic tree." },
        { description: "Use the Elven overpass advanced cliffside shortcut." },
        { description: "Equip any complete void set." },
        { description: "Claim a Chompy bird hat from Rantz after registering at least 1,000 kills." },
        { description: "Pickpocket an Elf." },
    ] },
};
