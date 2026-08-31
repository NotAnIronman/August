import type { DiaryAreaTasks } from "../types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/10")
// will be wrong.
export const karamjaDiaryTasks: DiaryAreaTasks = {
    areaName: "Karamja",
    easy: { tasks: [
        { description: "Pick 5 bananas from the plantation located east of the volcano." },
        { description: "Use the rope swing to travel to the Moss Giant Island north-west of Karamja." },
        { description: "Mine some gold from the rocks on the north-west peninsula of Karamja." },
        { description: "Travel to Port Sarim via the dock, east of Musa Point." },
        { description: "Travel to Ardougne via the port near Brimhaven." },
        { description: "Explore Cairn Island to the west of Karamja." },
        { description: "Use the Fishing spots north of the banana plantation." },
        { description: "Collect 5 seaweed from anywhere on Karamja." },
        { description: "Attempt the TzHaar Fight Pits or Fight Cave." },
        { description: "Kill a jogre in the Pothole dungeon." },
    ] },
    medium: { tasks: [
        { description: "Claim a ticket from the Agility Arena in Brimhaven." },
        { description: "Discover hidden walls in the dungeon below the volcano." },
        { description: "Visit the Isle of Crandor via the dungeon below the volcano." },
        { description: "Use Vigroy and Hajedy's cart service." },
        { description: "Earn 100% favour in the village of Tai Bwo Wannai." },
        { description: "Cook a spider on a stick." },
        { description: "Charter the Lady of the Waves from Cairn Isle to Port Khazard." },
        { description: "Cut a log from a teak tree." },
        { description: "Cut a log from a mahogany tree." },
        { description: "Catch a karambwan." },
        { description: "Exchange gems for a machete." },
        { description: "Use the gnome glider to travel to Karamja." },
        { description: "Grow a healthy fruit tree in the patch near Brimhaven." },
        { description: "Trap a horned graahk." },
        { description: "Chop the vines to gain deeper access to Brimhaven Dungeon." },
        { description: "Cross the lava using the stepping stones within Brimhaven Dungeon." },
        { description: "Climb the stairs within Brimhaven Dungeon." },
        { description: "Charter a ship from the shipyard in the far east of Karamja." },
        { description: "Mine a red topaz from a gem rock." },
    ] },
    hard: { tasks: [
        { description: "Become the Champion of the Fight Pits." },
        { description: "Kill a Ket-Zek in the Fight Caves." },
        { description: "Eat an oomlie wrap." },
        { description: "Craft some nature runes from essence." },
        { description: "Cook a karambwan thoroughly." },
        { description: "Kill a deathwing in the dungeon under the Kharazi Jungle." },
        { description: "Use the crossbow shortcut south of the volcano." },
        { description: "Collect 5 palm leaves." },
        { description: "Be assigned a Slayer task by the Slayer Master in Shilo Village." },
        { description: "Kill a metal dragon in Brimhaven Dungeon." },
    ] },
    elite: { tasks: [
        { description: "Craft 56 Nature runes simultaneously from essence without Extracts." },
        { description: "Equip a Fire Cape or Infernal Cape in Mor Ul Rek." },
        { description: "Check the health of a palm tree in Brimhaven." },
        { description: "Create an antivenom potion whilst standing in the horse shoe mine." },
        { description: "Check the health of your Calquat tree patch." },
    ] },
};
