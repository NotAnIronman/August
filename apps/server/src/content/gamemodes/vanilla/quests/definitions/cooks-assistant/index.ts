import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    CAKE_ITEM_ID,
    COOKS_ASSISTANT_QUEST_KEY,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_COOKS_ASSISTANT,
} from "@server/content/gamemodes/vanilla/quests/definitions/cooks-assistant/constants";
import { registerCooksAssistantInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/cooks-assistant/interactions";
import { buildCooksAssistantJournal } from "@server/content/gamemodes/vanilla/quests/definitions/cooks-assistant/journal";

export { COOKS_ASSISTANT_QUEST_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/cooks-assistant/constants";

export const cooksAssistantQuest: QuestDefinition = {
    key: COOKS_ASSISTANT_QUEST_KEY,
    name: "Cook's Assistant",
    varpId: VARP_COOKS_ASSISTANT,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 1,
        xp: [{ skillId: SkillId.Cooking, amount: 300, label: "Cooking" }],
        other: ["Access to the Cook-o-matic 100"],
    },
    rewardItemId: CAKE_ITEM_ID,
    overviewStartText:
        "speaking to the <col=800000>Cook<col=000080> in the kitchen of <col=800000>Lumbridge Castle<col=000080>.",
    buildJournal: buildCooksAssistantJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerCooksAssistantInteractions(cooksAssistantQuest, registry, services);
    },
};
