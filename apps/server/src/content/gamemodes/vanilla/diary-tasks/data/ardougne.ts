import type { DiaryAreaTasks } from "@server/content/gamemodes/vanilla/diary-tasks/types";

// Descriptions are sourced from the current OSRS Wiki task lists. Completion triggers remain intentionally undefined.
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/10")
// will be wrong.
export const ardougneDiaryTasks: DiaryAreaTasks = {
    areaName: "Ardougne",
    easy: { tasks: [
        { description: "Have Wizard Cromperty teleport you to the Rune essence mine." },
        { description: "Steal a cake from the East Ardougne market stalls." },
        { description: "Sell silk to the Silk trader in East Ardougne for 60 coins each." },
        { description: "Use the altar in East Ardougne's church." },
        { description: "Go out fishing on the Fishing Trawler." },
        { description: "Enter the Combat Training Camp north of West Ardougne." },
        { description: "Have Tindel Marchant identify a rusty sword for you." },
        { description: "Use the Ardougne lever to teleport to the Wilderness." },
        { description: "View Aleck's Hunter Emporium shop in Yanille." },
        { description: "Check what pets you have insured with Probita in East Ardougne." },
    ] },
    medium: { tasks: [
        { description: "Enter the unicorn pen in Ardougne Zoo using Fairy rings." },
        { description: "Grapple over Yanille's south wall and jump off." },
        { description: "Harvest some strawberries from the Ardougne farming patch." },
        { description: "Cast the Ardougne Teleport spell." },
        { description: "Travel to Castle Wars by Hot Air Balloon." },
        { description: "Claim buckets of sand from Bert in Yanille." },
        { description: "Catch any fish on the Fishing Platform." },
        { description: "Pickpocket the master farmer north of East Ardougne." },
        { description: "Collect some cave nightshade from the Skavid caves." },
        { description: "Kill a swordchick in the Tower of Life." },
        { description: "Equip an Iban's upgraded staff or upgrade an Iban's staff." },
        { description: "Visit the island east of the Necromancer Tower." },
    ] },
    hard: { tasks: [
        { description: "Recharge some jewellery at the Totem pole in the Legends' Guild." },
        { description: "Enter the Magic Guild." },
        { description: "Attempt to steal from a chest in Ardougne Castle." },
        { description: "Have a zookeeper put you in Ardougne Zoo's monkey cage." },
        { description: "Teleport to the Watchtower." },
        { description: "Catch a Red Salamander." },
        { description: "Check the health of a palm tree near Tree Gnome Village." },
        { description: "Pick some poison ivy berries from the patch south of East Ardougne." },
        { description: "Smith a Mithril platebody near Ardougne." },
        { description: "Enter your POH from Yanille." },
        { description: "Smith a Dragon sq shield in West Ardougne." },
        { description: "Craft some death runes at the Death altar." },
    ] },
    elite: { tasks: [
        { description: "Catch a manta ray in the Fishing Trawler and cook it in Port Khazard." },
        { description: "Picklock the door to the basement of Yanille Agility Dungeon." },
        { description: "Pickpocket a Hero." },
        { description: "Make a rune crossbow yourself from scratch within Witchaven or Yanille." },
        { description: "Imbue a Salve amulet at Nightmare Zone, or equip one that was imbued there." },
        { description: "Pick some torstol from the herb patch north of Ardougne." },
        { description: "Complete a lap of Ardougne's rooftop agility course." },
        { description: "Cast Ice Barrage on another player within Castle Wars." },
    ] },
};
