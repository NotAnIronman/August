import type { DiaryAreaTasks } from "../types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/14")
// will be wrong.
export const varrockDiaryTasks: DiaryAreaTasks = {
    areaName: "Varrock",
    easy: { tasks: [
        { description: "Browse Thessalia's store." },
        { description: "Have Aubury teleport you to the Essence mine." },
        { description: "Mine some Iron ore in the south-east mining patch near Varrock." },
        { description: "Make a normal plank at the Sawmill." },
        { description: "Enter the second level of the Stronghold of Security." },
        { description: "Jump over the fence south of Varrock." },
        { description: "Chop down a dying tree in the Lumber Yard." },
        { description: "Buy a newspaper." },
        { description: "Give a dog a bone!" },
        { description: "Spin a bowl on the pottery wheel and fire it in the oven in Barbarian Village." },
        { description: "Speak to Haig Halen after obtaining at least 50 Kudos." },
        { description: "Craft some Earth runes from Essence." },
        { description: "Catch some Trout in the River Lum at Barbarian Village." },
        { description: "Steal from the Tea stall in Varrock." },
    ] },
    medium: { tasks: [
        { description: "Have the Apothecary in Varrock make you a Strength potion." },
        { description: "Enter the Champions' Guild." },
        { description: "Select a colour for your kitten." },
        { description: "Use the spirit tree north of Varrock." },
        { description: "Perform the 4 emotes from the Stronghold of Security." },
        { description: "Enter the Tolna dungeon after completing A Soul's Bane." },
        { description: "Teleport to the digsite using a Digsite pendant." },
        { description: "Cast the Teleport to Varrock spell." },
        { description: "Get a Slayer task from Vannaka." },
        { description: "Make 20 Mahogany planks in one go." },
        { description: "Pick a White tree fruit." },
        { description: "Use the balloon to travel from Varrock." },
        { description: "Complete a lap of the Varrock Agility course." },
    ] },
    hard: { tasks: [
        { description: "Trade furs with the Fancy Dress Seller for a spottier cape and equip it." },
        { description: "Speak to Orlando Smith when you have achieved 153 Kudos." },
        { description: "Make a Waka canoe near Edgeville." },
        { description: "Teleport to Paddewwa." },
        { description: "Teleport to Barbarian Village with a skull sceptre." },
        { description: "Chop some yew logs in Varrock and burn them at the top of the Varrock church." },
        { description: "Have the Varrock estate agent decorate your house with Fancy Stone." },
        { description: "Collect at least 2 yew roots from the Tree patch in Varrock Palace." },
        { description: "Pray at the altar in Varrock palace with Smite active." },
        { description: "Squeeze through the obstacle pipe in Edgeville dungeon." },
    ] },
    elite: { tasks: [
        { description: "Create a super combat potion in Varrock west bank." },
        { description: "Use Lunar magic to make 20 mahogany planks at the Lumberyard." },
        { description: "Bake a summer pie in the Cooking Guild." },
        { description: "Smith and fletch ten rune darts within Varrock." },
        { description: "Craft 100 or more Earth runes simultaneously from Essence without the use of Extracts." },
    ] },
};
