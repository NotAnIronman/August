import type { DiaryAreaTasks } from "@server/content/gamemodes/vanilla/diary-tasks/types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/11")
// will be wrong.
export const faladorDiaryTasks: DiaryAreaTasks = {
    areaName: "Falador",
    easy: { tasks: [
        { description: "Find out your family crest from Sir Renitee." },
        { description: "Climb over the western Falador wall." },
        { description: "Browse Sarah's farm shop." },
        { description: "Get a haircut or a shave from the Falador Hairdresser." },
        { description: "Fill a bucket from the pump north of Falador west bank." },
        { description: "Kill a duck in Falador Park." },
        { description: "Make a mind tiara." },
        { description: "Take the boat to Entrana." },
        { description: "Repair a broken strut in the Motherlode Mine." },
        { description: "Claim a security book from the Security guard at Port Sarim jail." },
        { description: "Smith some Blurite Limbs on Doric's anvil." },
    ] },
    medium: { tasks: [
        { description: "Light a Bullseye lantern at the Chemist's in Rimmington." },
        { description: "Telegrab some Wine of Zamorak at the Chaos Temple by the Wilderness." },
        { description: "Unlock the Crystal chest in Taverley." },
        { description: "Place a scarecrow in the Falador farm flower patch." },
        { description: "Kill a Mogre at Mudskipper Point." },
        { description: "Visit the Port Sarim Rat Pits." },
        { description: "Grapple up and then jump off the north Falador wall." },
        { description: "Pickpocket a Falador guard." },
        { description: "Pray at the Altar of Guthix in Taverley whilst wearing full Initiate." },
        { description: "Mine some Gold ore at the Crafting Guild." },
        { description: "Squeeze through the crevice in the Dwarven mines." },
        { description: "Chop and burn some willow logs in Taverley." },
        { description: "Craft a fruit basket on the Falador Farm loom." },
        { description: "Teleport to Falador." },
    ] },
    hard: { tasks: [
        { description: "Craft 140 Mind runes simultaneously from Essence without the use of Extracts." },
        { description: "Change your family crest to the Saradomin symbol." },
        { description: "Kill the Giant Mole beneath Falador Park." },
        { description: "Kill a Skeletal Wyvern in the Asgarnia Ice Dungeon." },
        { description: "Complete a lap of the Falador rooftop agility course." },
        { description: "Enter the Mining Guild while wearing a Prospector helmet." },
        { description: "Kill the Blue Dragon under the Heroes' Guild." },
        { description: "Crack a wall safe within Rogues' Den." },
        { description: "Recharge prayer in the Port Sarim church while wearing full Proselyte." },
        { description: "Enter the Warriors' Guild." },
        { description: "Equip a dwarven helmet within the Dwarven mines." },
    ] },
    elite: { tasks: [
        { description: "Craft 252 Air Runes simultaneously from Essence without the use of Extracts." },
        { description: "Purchase a White 2h Sword from Sir Vyvin." },
        { description: "Find at least 3 magic roots at once when digging up a magic tree in Falador." },
        { description: "Perform a skillcape or quest cape emote at the top of Falador Castle." },
        { description: "Jump over the strange floor in Taverley dungeon." },
        { description: "Mix a Saradomin brew in Falador east bank." },
    ] },
};
