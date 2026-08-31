import type { DiaryAreaTasks } from "../types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/11")
// will be wrong.
export const morytaniaDiaryTasks: DiaryAreaTasks = {
    areaName: "Morytania",
    easy: { tasks: [
        { description: "Craft any Snelm from scratch in Morytania." },
        { description: "Cook a thin snail on the Port Phasmatys range." },
        { description: "Get a Slayer task from the Slayer Master in Canifis." },
        { description: "Kill a Banshee in the Slayer Tower." },
        { description: "Have Sbott in Canifis tan something for you." },
        { description: "Enter Mort Myre Swamp." },
        { description: "Kill a Ghoul." },
        { description: "Place a Scarecrow in the Morytania flower patch." },
        { description: "Offer some bonemeal at the Ectofuntus." },
        { description: "Kill a Werewolf in its human form using the Wolfbane Dagger." },
        { description: "Restore your prayer points at the Nature Altar." },
    ] },
    medium: { tasks: [
        { description: "Catch a swamp lizard." },
        { description: "Complete a lap of the Canifis agility course." },
        { description: "Obtain some Bark from a Hollow tree." },
        { description: "Travel to Dragontooth Isle." },
        { description: "Kill a Terror Dog." },
        { description: "Complete a game of Trouble Brewing." },
        { description: "Board the Swamp boat at the Hollows." },
        { description: "Make a batch of cannonballs at the Port Phasmatys furnace." },
        { description: "Kill a Fever Spider on Braindeath Island." },
        { description: "Use an Ectophial to return to Port Phasmatys." },
        { description: "Mix a Guthix Balance potion while in Morytania." },
    ] },
    hard: { tasks: [
        { description: "Enter the Kharyrll Portal in your POH." },
        { description: "Climb up the advanced spike chain within the Slayer Tower." },
        { description: "Harvest some Watermelon from the Allotment patch on Harmony Island." },
        { description: "Chop and burn some Mahogany logs on Mos Le'Harmless." },
        { description: "Complete a Temple Trek with a hard companion." },
        { description: "Kill a Cave Horror." },
        { description: "Harvest some Bittercap mushrooms from the patch in Canifis." },
        { description: "Pray at the Altar of Nature with Piety activated." },
        { description: "Use the shortcut to get to the bridge over the Salve." },
        { description: "Mine some Mithril ore in the Abandoned Mine." },
    ] },
    elite: { tasks: [
        { description: "Catch a shark in Burgh de Rott with your bare hands." },
        { description: "Cremate any Shade remains on a Magic or Redwood pyre." },
        { description: "Fertilize the Morytania herb patch using Lunar Magic." },
        { description: "Craft a Black dragonhide body in Canifis bank." },
        { description: "Kill an Abyssal demon in the Slayer Tower." },
        { description: "Loot the Barrows chest while wearing any complete Barrows set." },
    ] },
};
