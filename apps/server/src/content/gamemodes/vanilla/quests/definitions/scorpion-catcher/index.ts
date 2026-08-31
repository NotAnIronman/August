import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    ITEM,
    SCORPION_CATCHER_QUEST_KEY,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_SCORPION_CATCHER,
} from "@server/content/gamemodes/vanilla/quests/definitions/scorpion-catcher/constants";
import { registerScorpionCatcherInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/scorpion-catcher/interactions";
import { buildScorpionCatcherJournal } from "@server/content/gamemodes/vanilla/quests/definitions/scorpion-catcher/journal";

export { SCORPION_CATCHER_QUEST_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/scorpion-catcher/constants";

export const scorpionCatcherQuest: QuestDefinition = {
    key: SCORPION_CATCHER_QUEST_KEY,
    name: "Scorpion Catcher",
    members: true,
    varpId: VARP_SCORPION_CATCHER,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    requirements: {
        skills: [{ skillId: SkillId.Prayer, level: 31, label: "Prayer" }],
    },
    rewards: {
        questPoints: 1,
        xp: [{ skillId: SkillId.Strength, amount: 6625, label: "Strength" }],
        other: ["Thormac can convert battlestaves into mystic staves"],
    },
    rewardItemId: ITEM.fullCage,
    overviewStartText:
        "speaking to <col=800000>Thormac<col=000080> in the <col=800000>Sorcerer's Tower<col=000080> south-west of Catherby.",
    buildJournal(player, services): string[] {
        return buildScorpionCatcherJournal(player, services, scorpionCatcherQuest);
    },
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerScorpionCatcherInteractions(scorpionCatcherQuest, registry, services);
    },
};
