import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { QUEST_KEYS, QUEST_STATE } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-series/constants";
import { ITEM } from "@server/content/gamemodes/vanilla/quests/definitions/dig-site/constants";
import { registerDigSiteInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/dig-site/interactions";
import { buildDigSiteJournal } from "@server/content/gamemodes/vanilla/quests/definitions/dig-site/journal";

export const digSiteQuest: QuestDefinition = {
    key: QUEST_KEYS.digSite,
    name: "The Dig Site",
    members: true,
    varpId: QUEST_STATE[QUEST_KEYS.digSite].varpId,
    startedValue: 1,
    completionValue: QUEST_STATE[QUEST_KEYS.digSite].completionValue,
    rewards: {
        questPoints: 2,
        xp: [
            { skillId: SkillId.Mining, amount: 15300, label: "Mining" },
            { skillId: SkillId.Herblore, amount: 2000, label: "Herblore" },
        ],
        items: [{ itemId: ITEM.goldBar, quantity: 2, label: "2 Gold bars" }],
        other: ["Access to the Dig Site's deeper dig shafts"],
    },
    rewardItemId: ITEM.ancientTalisman,
    overviewStartText:
        "speaking to an <col=800000>Examiner<col=000080> at the Dig Site Exam Centre.",
    buildJournal: buildDigSiteJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerDigSiteInteractions(digSiteQuest, registry, services);
    },
};
