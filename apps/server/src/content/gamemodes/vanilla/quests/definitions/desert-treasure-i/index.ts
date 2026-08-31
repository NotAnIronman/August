import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { registerQuestDeathHandlers } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-series/runtime";
import { ITEM, QUEST_KEYS, QUEST_STATE } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-i/constants";
import { registerDesertTreasureIInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-i/interactions";
import { buildDesertTreasureIJournal } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-i/journal";

export const desertTreasureIQuest: QuestDefinition = {
    key: QUEST_KEYS.desertTreasure,
    name: "Desert Treasure I",
    members: true,
    varpId: QUEST_STATE[QUEST_KEYS.desertTreasure].varpId,
    startedValue: 1,
    completionValue: QUEST_STATE[QUEST_KEYS.desertTreasure].completionValue,
    rewards: {
        questPoints: 3,
        xp: [{ skillId: SkillId.Magic, amount: 20000, label: "Magic" }],
        other: [
            "Access to the Ancient Magicks spellbook",
            "The ability to purchase an Ancient staff",
            "Access to the Smoke Dungeon",
        ],
    },
    rewardItemId: ITEM.ancientStaff,
    overviewStartText:
        "speaking to the <col=800000>Asgarnia Smith<col=000080> at the Bedabin Camp.",
    buildJournal: buildDesertTreasureIJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerDesertTreasureIInteractions(desertTreasureIQuest, registry, services);
        registerQuestDeathHandlers(services);
    },
};

export { QUEST_KEYS } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-i/constants";
