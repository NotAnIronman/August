import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { QUEST_KEYS, QUEST_STATE } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-series/constants";
import { ITEM } from "@server/content/gamemodes/vanilla/quests/definitions/waterfall-quest/constants";
import { registerWaterfallQuestInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/waterfall-quest/interactions";
import { buildWaterfallQuestJournal } from "@server/content/gamemodes/vanilla/quests/definitions/waterfall-quest/journal";

export const waterfallQuest: QuestDefinition = {
    key: QUEST_KEYS.waterfall,
    name: "Waterfall Quest",
    members: true,
    varpId: QUEST_STATE[QUEST_KEYS.waterfall].varpId,
    startedValue: 1,
    completionValue: QUEST_STATE[QUEST_KEYS.waterfall].completionValue,
    rewards: {
        questPoints: 1,
        xp: [
            { skillId: SkillId.Attack, amount: 13750, label: "Attack" },
            { skillId: SkillId.Strength, amount: 13750, label: "Strength" },
        ],
        items: [
            { itemId: ITEM.diamond, quantity: 2, label: "2 Diamonds" },
            { itemId: ITEM.goldBar, quantity: 2, label: "2 Gold bars" },
            { itemId: ITEM.mithrilSeeds, quantity: 40, label: "40 Mithril seeds" },
        ],
        other: ["Access to the Waterfall Dungeon"],
    },
    rewardItemId: ITEM.glarialsUrnFull,
    overviewStartText: "speaking to <col=800000>Almera<col=000080> beside Baxtorian Falls.",
    buildJournal: buildWaterfallQuestJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerWaterfallQuestInteractions(waterfallQuest, registry, services);
    },
};
