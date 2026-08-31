import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    ITEM,
    KNIGHTS_SWORD_QUEST_KEY,
    STAGE_COMPLETE,
    STAGE_FIND_RELDO,
    VARP_KNIGHTS_SWORD,
} from "@server/content/gamemodes/vanilla/quests/definitions/knights-sword/constants";
import { registerKnightsSwordInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/knights-sword/interactions";
import { buildKnightsSwordJournal } from "@server/content/gamemodes/vanilla/quests/definitions/knights-sword/journal";

export { KNIGHTS_SWORD_QUEST_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/knights-sword/constants";

export const knightsSwordQuest: QuestDefinition = {
    key: KNIGHTS_SWORD_QUEST_KEY,
    name: "The Knight's Sword",
    varpId: VARP_KNIGHTS_SWORD,
    startedValue: STAGE_FIND_RELDO,
    completionValue: STAGE_COMPLETE,
    requirements: {
        skills: [{ skillId: SkillId.Mining, level: 10, label: "Mining" }],
    },
    rewards: {
        questPoints: 1,
        xp: [{ skillId: SkillId.Smithing, amount: 12725, label: "Smithing" }],
    },
    rewardItemId: ITEM.bluriteSword,
    overviewStartText:
        "speaking to the <col=800000>Squire<col=000080> in the courtyard of the <col=800000>White Knights' Castle<col=000080>.",
    buildJournal(player, services): string[] {
        return buildKnightsSwordJournal(player, services, knightsSwordQuest);
    },
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerKnightsSwordInteractions(knightsSwordQuest, registry, services);
    },
};
