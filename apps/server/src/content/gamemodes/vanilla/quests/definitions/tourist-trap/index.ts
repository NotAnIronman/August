import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { QUEST_KEYS, QUEST_STATE } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-series/constants";
import { ITEM } from "@server/content/gamemodes/vanilla/quests/definitions/tourist-trap/constants";
import { registerTouristTrapInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/tourist-trap/interactions";
import { buildTouristTrapJournal } from "@server/content/gamemodes/vanilla/quests/definitions/tourist-trap/journal";

export const touristTrapQuest: QuestDefinition = {
    key: QUEST_KEYS.touristTrap,
    name: "The Tourist Trap",
    members: true,
    varpId: QUEST_STATE[QUEST_KEYS.touristTrap].varpId,
    startedValue: 1,
    completionValue: QUEST_STATE[QUEST_KEYS.touristTrap].completionValue,
    rewards: {
        questPoints: 2,
        other: [
            "2 lots of 4,650 XP in a choice of skills",
            "The ability to smith darts",
            "Full slave robes",
        ],
    },
    rewardItemId: ITEM.anaInBarrel,
    overviewStartText: "speaking to <col=800000>Irena<col=000080> at the Shantay Pass.",
    buildJournal: buildTouristTrapJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerTouristTrapInteractions(touristTrapQuest, registry, services);
    },
};
