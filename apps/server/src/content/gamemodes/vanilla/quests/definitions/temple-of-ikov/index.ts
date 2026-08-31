import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { QUEST_KEYS, QUEST_STATE } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-series/constants";
import { ITEM } from "@server/content/gamemodes/vanilla/quests/definitions/temple-of-ikov/constants";
import { registerTempleOfIkovInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/temple-of-ikov/interactions";
import { buildTempleOfIkovJournal } from "@server/content/gamemodes/vanilla/quests/definitions/temple-of-ikov/journal";

export const templeOfIkovQuest: QuestDefinition = {
    key: QUEST_KEYS.templeOfIkov,
    name: "Temple of Ikov",
    members: true,
    varpId: QUEST_STATE[QUEST_KEYS.templeOfIkov].varpId,
    startedValue: 10,
    completionValue: QUEST_STATE[QUEST_KEYS.templeOfIkov].completionValue,
    rewards: {
        questPoints: 1,
        xp: [
            { skillId: SkillId.Ranged, amount: 10500, label: "Ranged" },
            { skillId: SkillId.Fletching, amount: 8000, label: "Fletching" },
        ],
        other: ["Boots of lightness", "Armies of Gielinor side unlocked"],
    },
    rewardItemId: ITEM.staffOfArmadyl,
    overviewStartText: "speaking to <col=800000>Lucien<col=000080> at the Flying Horse Inn.",
    buildJournal: buildTempleOfIkovJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerTempleOfIkovInteractions(templeOfIkovQuest, registry, services);
    },
};
