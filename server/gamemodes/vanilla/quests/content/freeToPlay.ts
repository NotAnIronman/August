// ============================================================================
// Free-to-play quest content catalog
//
// This file deliberately contains no cache progress sources, interaction
// handlers, or completion rules. It is the canonical factual layer used by
// the quest UI while individual quest scripts own their eventual state logic.
// Facts are imported from the current OSRS quest-detail and reward records.
// ============================================================================

export interface FreeToPlayQuestContent {
    /** Stable, normalized key shared with the quest-list catalog. */
    key: string;
    /** Exact cache/display spelling. */
    displayName: string;
    /** Short, player-facing summary used by the quest overview. */
    description: string;
    /** Rich-text continuation for "I can start this quest by ...". */
    overviewStartText: string;
    journalInfo: {
        difficulty: string;
        length: string;
        storyline: string;
    };
    /** Actual prerequisites only; combat advice belongs in combatNotes. */
    requirementLines: readonly string[];
    /** Items the official quest details list as needed to complete the quest. */
    requiredItems: readonly string[];
    /** Enemies or danger notes that are useful before beginning. */
    combatNotes: readonly string[];
    rewards: readonly string[];
    /** State-neutral route notes, retained until gameplay scripts own stages. */
    outline: readonly string[];
}

const standalone = "Standalone";

export const FREE_TO_PLAY_QUEST_CONTENT: readonly FreeToPlayQuestContent[] = [
    {
        key: "black knights' fortress",
        displayName: "Black Knights' Fortress",
        description:
            "Sir Amik Varze needs someone to spy on the Black Knights and stop their secret weapon.",
        overviewStartText:
            "speaking to <col=800000>Sir Amik Varze<col=000080> in the western tower of <col=800000>Falador Castle<col=000080>.",
        journalInfo: { difficulty: "Intermediate", length: "Very Short", storyline: standalone },
        requirementLines: ["12 Quest Points"],
        requiredItems: [
            "Cabbage (not a Draynor Manor cabbage)",
            "Iron chainbody and bronze med helm, or a black full armour disguise",
        ],
        combatNotes: ["Be ready to evade level 33 Black Knights."],
        rewards: ["3 Quest Points", "2,500 coins"],
        outline: [
            "Accept Sir Amik's mission and prepare a Black Knight disguise.",
            "Infiltrate the fortress, learn the knights' plan, and find the secret weapon.",
            "Use the correct cabbage to sabotage the weapon and report back to Sir Amik.",
        ],
    },
    {
        key: "below ice mountain",
        displayName: "Below Ice Mountain",
        description:
            "Willow wants to reopen the sealed ruins beneath Ice Mountain, but first needs her old crew reunited.",
        overviewStartText:
            "speaking to <col=800000>Willow<col=000080> on the path south of <col=800000>Ice Mountain<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Short", storyline: standalone },
        requirementLines: ["16 Quest Points"],
        requiredItems: [
            "Cooked meat", "Bread", "Knife", "Beer (or Asgarnian ale, dwarven stout, or wizard's mind bomb)",
        ],
        combatNotes: [
            "An Ancient Guardian (level 25) can be fought, or avoided with a pickaxe and 10 Mining.",
        ],
        rewards: [
            "1 Quest Point", "2,000 coins", "Access to the Ruins of Camdozaal", "Flex emote",
            "Ability to make steak sandwiches",
        ],
        outline: [
            "Find Willow's former crew: Checkal, Burntof, Marley, and Ramarno.",
            "Help the crew overcome their objections and return them to the ancient doors.",
            "Enter the ruins, confront Willow's scheme, and deal with the Ancient Guardian.",
        ],
    },
    {
        key: "cook's assistant",
        displayName: "Cook's Assistant",
        description: "The Lumbridge Castle cook needs ingredients for Duke Horacio's birthday cake.",
        overviewStartText:
            "speaking to the <col=800000>Cook<col=000080> in the kitchen of <col=800000>Lumbridge Castle<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Very Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["Egg", "Bucket of milk", "Pot of flour"],
        combatNotes: [],
        rewards: ["1 Quest Point", "300 Cooking experience", "Access to the Cook-o-matic 100"],
        outline: [
            "Ask the Cook which ingredients are missing.",
            "Bring him an egg, a bucket of milk, and a pot of flour.",
            "Return the ingredients so the birthday cake can be finished.",
        ],
    },
    {
        key: "the corsair curse",
        displayName: "The Corsair Curse",
        description: "Captain Tock's crew have fallen ill, and he fears a curse is to blame.",
        overviewStartText:
            "speaking to <col=800000>Captain Tock<col=000080> at the crossroads north of <col=800000>Port Sarim<col=000080>.",
        journalInfo: { difficulty: "Intermediate", length: "Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["Spade", "Tinderbox"],
        combatNotes: ["Be prepared to defeat Ithoi the Navigator (level 35)."],
        rewards: [
            "2 Quest Points", "Access to Yusuf's bank in Corsair Cove",
            "Ability to dock boats at Corsair Cove",
        ],
        outline: [
            "Travel with Captain Tock to Corsair Cove and speak to each afflicted corsair.",
            "Investigate and disprove the crew's competing stories about the supposed curse.",
            "Expose the real cause, defeat Ithoi the Navigator, and return to Captain Tock.",
        ],
    },
    {
        key: "demon slayer",
        displayName: "Demon Slayer",
        description: "A demon threatens Varrock, and Aris believes you are destined to stop it.",
        overviewStartText:
            "speaking to <col=800000>Aris<col=000080> in her tent on the western side of <col=800000>Varrock Square<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Short", storyline: "Demon Slayer" },
        requirementLines: [],
        requiredItems: ["Water container", "25 bones", "1 coin"],
        combatNotes: [
            "You must defeat Delrith (level 27) using Silverlight while Dark Wizards assist him.",
        ],
        rewards: ["3 Quest Points", "Silverlight"],
        outline: [
            "Learn from Aris why Delrith is coming to Varrock.",
            "Recover the three keys needed to obtain Silverlight from Sir Prysin.",
            "Use Silverlight to defeat Delrith at the stone circle south of Varrock.",
        ],
    },
    {
        key: "doric's quest",
        displayName: "Doric's Quest",
        description: "Doric will let you use his anvils if you can collect ores for his work.",
        overviewStartText:
            "speaking to <col=800000>Doric<col=000080> at his home north of <col=800000>Falador<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Very Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["6 clay", "4 copper ore", "2 iron ore"],
        combatNotes: [],
        rewards: [
            "1 Quest Point", "1,300 Mining experience", "180 coins", "Use of Doric's anvils",
        ],
        outline: [
            "Ask Doric which supplies he needs.",
            "Bring him six clay, four copper ore, and two iron ore.",
            "Return to Doric with the materials.",
        ],
    },
    {
        key: "dragon slayer i",
        displayName: "Dragon Slayer I",
        description:
            "Prove yourself a champion by reaching Crandor and defeating Elvarg, the dragon that guards it.",
        overviewStartText:
            "speaking to the <col=800000>Guildmaster<col=000080> in the <col=800000>Champions' Guild<col=000080>.",
        journalInfo: { difficulty: "Experienced", length: "Medium", storyline: "Dragonkin" },
        requirementLines: ["32 Quest Points"],
        requiredItems: [
            "Unfired bowl", "Wizard's mind bomb", "Lobster pot", "Silk", "Hammer",
            "90 steel nails", "3 planks", "2,000 coins", "Anti-dragon shield",
        ],
        combatNotes: ["You must defeat Elvarg, a level 83 dragon."],
        rewards: [
            "2 Quest Points", "18,650 Strength experience", "18,650 Defence experience",
            "Right to wear rune platebodies and green dragonhide bodies", "Access to Crandor",
        ],
        outline: [
            "Receive the quest from the Guildmaster and acquire an anti-dragon shield.",
            "Recover all pieces of the map to Crandor and have Ned repair a ship at Port Sarim.",
            "Sail to Crandor, navigate Melzar's Maze, and defeat Elvarg in her lair.",
        ],
    },
    {
        key: "ernest the chicken",
        displayName: "Ernest the Chicken",
        description: "Veronica's fiancé entered Draynor Manor and somehow emerged as a chicken.",
        overviewStartText:
            "speaking to <col=800000>Veronica<col=000080> outside <col=800000>Draynor Manor<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Very Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["Spade", "Fish food", "Poison"],
        combatNotes: ["A level 22 skeleton guards part of the manor."],
        rewards: ["4 Quest Points", "300 coins"],
        outline: [
            "Offer to find Ernest for Veronica and investigate the manor.",
            "Help Professor Oddenstein repair the machine that can reverse the transformation.",
            "Solve the manor's door, poison, and lever puzzles to restore Ernest.",
        ],
    },
    {
        key: "goblin diplomacy",
        displayName: "Goblin Diplomacy",
        description: "The Goblin Generals cannot agree on a colour of armour for their tribe.",
        overviewStartText:
            "speaking to a <col=800000>Goblin General<col=000080> in <col=800000>Goblin Village<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Very Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["3 goblin mail", "Blue dye", "Red dye", "Yellow dye"],
        combatNotes: [],
        rewards: ["5 Quest Points", "200 Crafting experience", "Gold bar"],
        outline: [
            "Hear the dispute between General Bentnoze and General Wartface.",
            "Dye goblin mail blue, orange, and brown for the generals to inspect.",
            "Present the final colour that ends the argument.",
        ],
    },
    {
        key: "imp catcher",
        displayName: "Imp Catcher",
        description: "Wizard Mizgog's magic beads were stolen by the imps summoned by Grayzag.",
        overviewStartText:
            "speaking to <col=800000>Wizard Mizgog<col=000080> on the top floor of the <col=800000>Wizards' Tower<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["Black bead", "Yellow bead", "Red bead", "White bead"],
        combatNotes: [],
        rewards: ["1 Quest Point", "875 Magic experience", "Amulet of accuracy"],
        outline: [
            "Ask Wizard Mizgog about Grayzag's imps and the stolen beads.",
            "Collect one bead of each colour from imps or other players.",
            "Give the complete set of beads to Wizard Mizgog.",
        ],
    },
    {
        key: "the ides of milk",
        displayName: "The Ides of Milk",
        description: "A disturbance in the Lumbridge cow fields is threatening the local dairy farms.",
        overviewStartText:
            "speaking to <col=800000>Cassius<col=000080> by the <col=800000>Lumbridge pond<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Short", storyline: standalone },
        requirementLines: [],
        requiredItems: [],
        combatNotes: ["Be ready to defeat the bull Brutus (recommended combat level 15)."],
        rewards: [
            "1 Quest Point", "Access to Brutus, the cow boss", "Cowbell amulet",
            "Choice of 1,000 experience in a combat skill, including Prayer",
        ],
        outline: [
            "Hear Cassius's plan and ask Seth and Gillie Groats about their cows.",
            "Investigate the source of the herd's distress and defeat the charging bull.",
            "Use the evidence to expose Cassius, then return to Gillie for the extra rewards.",
        ],
    },
    {
        key: "learning the ropes",
        displayName: "Learning the Ropes",
        description: "Complete the Tutorial Island lessons and prepare for adventure on the mainland.",
        overviewStartText:
            "speaking to the <col=800000>Quest Guide<col=000080> on <col=800000>Tutorial Island<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Very Short", storyline: standalone },
        requirementLines: [],
        requiredItems: [],
        combatNotes: [],
        rewards: [
            "1 Quest Point", "Access to the mainland and Lumbridge Home Teleport",
            "Starter supplies: bronze tools and weapons, shortbow and arrows, basic runes, food, and fishing supplies",
            "25 coins in the bank",
        ],
        outline: [
            "Follow the Tutorial Island instructors through movement, skills, combat, banking, and magic.",
            "Speak with the Quest Guide to record the tutorial as a completed quest.",
            "Finish the final lesson to depart for the mainland.",
        ],
    },
    {
        key: "misthalin mystery",
        displayName: "Misthalin Mystery",
        description: "A dying couple in Lumbridge Swamp ask you to stop a cryptic killer before more friends die.",
        overviewStartText:
            "speaking to <col=800000>Abigale<col=000080> or <col=800000>Hewey<col=000080> in south-east <col=800000>Lumbridge Swamp<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["Bucket", "Tinderbox", "Knife"],
        combatNotes: [],
        rewards: ["1 Quest Point", "600 Crafting experience", "Uncut ruby", "Uncut emerald", "Uncut sapphire"],
        outline: [
            "Examine the scene in Lumbridge Swamp and question the people at the nearby house.",
            "Collect and interpret the clues the killer has left behind.",
            "Identify the culprit and solve the final puzzle in the cellar.",
        ],
    },
    {
        key: "pirate's treasure",
        displayName: "Pirate's Treasure",
        description: "Redbeard Frank knows where a pirate treasure is buried, but he wants Karamjan rum first.",
        overviewStartText:
            "speaking to <col=800000>Redbeard Frank<col=000080> at <col=800000>Port Sarim<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Very Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["Karamjan rum", "White apron", "60 coins", "10 bananas", "Spade"],
        combatNotes: ["A level 4 gardener may need to be evaded or defeated."],
        rewards: ["2 Quest Points", "450 coins", "Gold ring", "Emerald"],
        outline: [
            "Bring Redbeard Frank a bottle of Karamjan rum.",
            "Use his pirate map to locate the correct orchard on Karamja.",
            "Return to Port Sarim, dig at the marked spot, and open One-Eyed Hector's chest.",
        ],
    },
    {
        key: "prince ali rescue",
        displayName: "Prince Ali Rescue",
        description: "Prince Ali has been kidnapped by Lady Keli, and Al Kharid needs a rescue plan.",
        overviewStartText:
            "speaking to <col=800000>Chancellor Hassan<col=000080> in <col=800000>Al Kharid Palace<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Short", storyline: "Kharidian" },
        requirementLines: [],
        requiredItems: [
            "Soft clay", "3 balls of wool", "Yellow dye", "Redberries", "Ashes", "Bucket or jug of water",
            "Pot of flour", "Bronze bar", "Pink skirt", "3 beers", "Rope",
        ],
        combatNotes: ["Jail guards at the prison are level 26 and aggressive."],
        rewards: ["3 Quest Points", "700 coins", "Free passage through the Al Kharid gate"],
        outline: [
            "Speak to Hassan and Leela to learn where Prince Ali is held.",
            "Gather the materials needed for a disguise and a diversion at the jail.",
            "Swap Ali with the disguised guard and return him safely to the palace.",
        ],
    },
    {
        key: "the restless ghost",
        displayName: "The Restless Ghost",
        description: "A ghost haunts the Lumbridge graveyard and needs help finding peace.",
        overviewStartText:
            "speaking to <col=800000>Father Aereck<col=000080> in the church east of <col=800000>Lumbridge Castle<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Short", storyline: standalone },
        requirementLines: [],
        requiredItems: [],
        combatNotes: ["A level 13 skeleton may need to be fought or avoided."],
        rewards: ["1 Quest Point", "1,125 Prayer experience", "Amulet of ghostspeak"],
        outline: [
            "Ask Father Aereck about the ghost in the graveyard.",
            "Visit Father Urhney for an amulet of ghostspeak, then speak to the ghost.",
            "Recover the ghost's skull from the Wizards' Tower and return it to the coffin.",
        ],
    },
    {
        key: "romeo & juliet",
        displayName: "Romeo & Juliet",
        description: "Romeo and Juliet need help overcoming her father's objections to their relationship.",
        overviewStartText:
            "speaking to <col=800000>Romeo<col=000080> in <col=800000>Varrock Square<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["Cadava berries"],
        combatNotes: [],
        rewards: ["5 Quest Points"],
        outline: [
            "Hear Romeo's problem and speak with Juliet at her family home.",
            "Seek advice from Father Lawrence and the Apothecary.",
            "Bring the Cadava potion to Juliet and help resolve the lovers' plan.",
        ],
    },
    {
        key: "rune mysteries",
        displayName: "Rune Mysteries",
        description: "The Order of Wizards needs help restoring knowledge of the rune essence mine.",
        overviewStartText:
            "speaking to <col=800000>Duke Horacio<col=000080> upstairs in <col=800000>Lumbridge Castle<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Short", storyline: "Order of Wizards" },
        requirementLines: [],
        requiredItems: ["Air talisman (given at the start)"],
        combatNotes: [],
        rewards: [
            "1 Quest Point", "Access to the Rune Essence Mine", "Ability to train Runecraft", "Air talisman",
        ],
        outline: [
            "Take Duke Horacio's talisman research package to Sedridor at the Wizards' Tower.",
            "Deliver Sedridor's research to Aubury in Varrock.",
            "Return to Sedridor after learning the route to the rune essence mine.",
        ],
    },
    {
        key: "sheep shearer",
        displayName: "Sheep Shearer",
        description: "Fred the Farmer needs a large delivery of wool for his sheep business.",
        overviewStartText:
            "speaking to <col=800000>Fred the Farmer<col=000080> north-west of <col=800000>Lumbridge<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Very Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["20 balls of wool", "Shears if making the wool yourself"],
        combatNotes: [],
        rewards: ["1 Quest Point", "150 Crafting experience", "60 coins"],
        outline: [
            "Ask Fred what his sheep farm needs.",
            "Obtain twenty balls of wool by spinning sheared fleece or buying wool.",
            "Deliver the wool to Fred.",
        ],
    },
    {
        key: "shield of arrav",
        displayName: "Shield of Arrav",
        description: "A valuable shield was stolen from the Varrock Museum long ago, and you need a partner to recover it.",
        overviewStartText:
            "speaking to <col=800000>Reldo<col=000080> in the <col=800000>Varrock Palace library<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Short", storyline: standalone },
        requirementLines: ["A trusted partner in the opposite gang"],
        requiredItems: ["20 coins for the Phoenix Gang route, or 2 Phoenix crossbows for the Black Arm Gang route"],
        combatNotes: [],
        rewards: ["1 Quest Point", "600 coins"],
        outline: [
            "Read the Shield of Arrav book in the library and join either the Phoenix Gang or Black Arm Gang.",
            "Work with a partner in the other gang to obtain both halves of the shield.",
            "Give the completed shield and certificates to Curator Haig Halen at the museum.",
        ],
    },
    {
        key: "the knight's sword",
        displayName: "The Knight's Sword",
        description: "A Falador squire has lost Sir Vyvin's ceremonial sword and needs a replacement before he is discovered.",
        overviewStartText:
            "speaking to the <col=800000>Squire<col=000080> in the courtyard of the <col=800000>White Knights' Castle<col=000080>.",
        journalInfo: { difficulty: "Intermediate", length: "Short", storyline: standalone },
        requirementLines: ["Level 10 Mining"],
        requiredItems: ["Redberry pie", "2 iron bars", "Pickaxe"],
        combatNotes: ["Level 53 ice giants and level 57 ice warriors patrol the blurite mine."],
        rewards: ["1 Quest Point", "12,725 Smithing experience", "Blurite sword"],
        outline: [
            "Find out why the Squire needs a replacement sword and seek help from Reldo.",
            "Show Thurgo the portrait of the original sword and collect blurite ore from the mine.",
            "Bring Thurgo the ore and iron bars so he can forge the replacement.",
        ],
    },
    {
        key: "vampyre slayer",
        displayName: "Vampyre Slayer",
        description: "Draynor Village is terrorised by Count Draynor, the vampyre in the manor to the north.",
        overviewStartText:
            "speaking to <col=800000>Morgan<col=000080> in <col=800000>Draynor Village<col=000080>.",
        journalInfo: { difficulty: "Intermediate", length: "Very Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["Hammer", "Beer", "Stake"],
        combatNotes: ["You must defeat Count Draynor (level 34), who regenerates health quickly."],
        rewards: ["3 Quest Points", "4,825 Attack experience"],
        outline: [
            "Ask Morgan how Count Draynor can be killed.",
            "Use the clues in Draynor Manor to find the stake and prepare a hammer.",
            "Confront Count Draynor in the manor and finish him with the stake.",
        ],
    },
    {
        key: "witch's potion",
        displayName: "Witch's Potion",
        description: "Hetty the Rimmington witch can help unlock your hidden magical potential.",
        overviewStartText:
            "speaking to <col=800000>Hetty<col=000080> in her house in <col=800000>Rimmington<col=000080>.",
        journalInfo: { difficulty: "Novice", length: "Very Short", storyline: standalone },
        requirementLines: [],
        requiredItems: ["Burnt meat", "Eye of newt", "Onion", "Rat's tail"],
        combatNotes: [],
        rewards: ["1 Quest Point", "325 Magic experience"],
        outline: [
            "Ask Hetty about making a potion.",
            "Gather the four ingredients, including the rat's tail obtained after starting the quest.",
            "Add the ingredients to Hetty's cauldron and drink the potion.",
        ],
    },
    {
        key: "x marks the spot",
        displayName: "X Marks the Spot",
        description: "Veos needs help following the clues in a small treasure hunt around Lumbridge.",
        overviewStartText:
            "speaking to <col=800000>Veos<col=000080> in <col=800000>The Sheared Ram<col=000080> in Lumbridge.",
        journalInfo: { difficulty: "Novice", length: "Very Short", storyline: "Great Kourend" },
        requirementLines: [],
        requiredItems: ["Spade"],
        combatNotes: [],
        rewards: [
            "1 Quest Point", "200 coins", "Antique lamp with 300 experience in a chosen skill",
            "Ability to receive scroll boxes", "Beginner scroll box if one is not already held",
            "+1 clue scroll cap for every tier",
        ],
        outline: [
            "Ask Veos for the first clue and decode its location in Lumbridge.",
            "Follow each clue by searching and digging at the indicated landmarks.",
            "Unearth the final casket and claim the treasure.",
        ],
    },
];

const freeToPlayQuestByKey = new Map<string, FreeToPlayQuestContent>();
const freeToPlayQuestByName = new Map<string, FreeToPlayQuestContent>();

for (const content of FREE_TO_PLAY_QUEST_CONTENT) {
    const key = normalizeQuestContentKey(content.key);
    const name = normalizeQuestContentKey(content.displayName);
    if (freeToPlayQuestByKey.has(key) || freeToPlayQuestByName.has(name)) {
        throw new Error(`Duplicate free-to-play quest content: ${content.displayName}`);
    }
    freeToPlayQuestByKey.set(key, content);
    freeToPlayQuestByName.set(name, content);
}

function normalizeQuestContentKey(value: string): string {
    return String(value ?? "").trim().toLowerCase();
}

export function getFreeToPlayQuestContent(reference: string): FreeToPlayQuestContent | undefined {
    const normalized = normalizeQuestContentKey(reference);
    return freeToPlayQuestByKey.get(normalized) ?? freeToPlayQuestByName.get(normalized);
}

export function buildFreeToPlayQuestJournal(content: FreeToPlayQuestContent): string[] {
    const lines = [
        content.description,
        "",
        "<col=000080>To begin:</col>",
        `I can start this quest by ${content.overviewStartText}`,
    ];

    appendSection(lines, "Requirements:", content.requirementLines);
    appendSection(lines, "Items needed:", content.requiredItems);
    appendSection(lines, "Combat notes:", content.combatNotes);
    appendSection(lines, "Quest outline:", content.outline);
    return lines;
}

export function buildFreeToPlayQuestOverview(content: FreeToPlayQuestContent): string[] {
    const lines = [
        content.description,
        "",
        "<col=000080>To begin:</col>",
        `I can start this quest by ${content.overviewStartText}`,
    ];

    appendSection(lines, "Requirements:", content.requirementLines);
    appendSection(lines, "Items needed:", content.requiredItems);
    appendSection(lines, "Rewards:", content.rewards);
    return lines;
}

function appendSection(lines: string[], heading: string, entries: readonly string[]): void {
    if (entries.length === 0) return;
    lines.push("", `<col=000080>${heading}</col>`, ...entries.map((entry) => `- ${entry}`));
}
