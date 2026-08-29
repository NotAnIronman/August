import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    AMULET_OF_ACCURACY_ITEM_ID,
    IMP_CATCHER_QUEST_KEY,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_IMP_CATCHER,
    WIZARD_MIZGOG_NPC_ID,
} from "@server/content/gamemodes/vanilla/quests/definitions/imp-catcher/constants";
import { createMizgogTalkHandler } from "@server/content/gamemodes/vanilla/quests/definitions/imp-catcher/dialogue";
import { buildImpCatcherJournal } from "@server/content/gamemodes/vanilla/quests/definitions/imp-catcher/journal";

export { IMP_CATCHER_QUEST_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/imp-catcher/constants";

export const impCatcherQuest: QuestDefinition = {
    key: IMP_CATCHER_QUEST_KEY,
    name: "Imp Catcher",
    varpId: VARP_IMP_CATCHER,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 1,
        xp: [{ skillId: SkillId.Magic, amount: 875, label: "Magic" }],
        items: [
            {
                itemId: AMULET_OF_ACCURACY_ITEM_ID,
                quantity: 1,
                label: "An Amulet of Accuracy",
            },
        ],
    },
    rewardItemId: AMULET_OF_ACCURACY_ITEM_ID,
    overviewStartText:
        "speaking to <col=800000>Wizard Mizgog<col=000080> on the top floor of the <col=800000>Wizards' Tower<col=000080>.",
    buildJournal: buildImpCatcherJournal,
    register(registry: IScriptRegistry, _services: ScriptServices): void {
        const talk = createMizgogTalkHandler(impCatcherQuest);
        registry.registerNpcScript({
            npcId: WIZARD_MIZGOG_NPC_ID,
            option: "talk-to",
            handler: talk,
        });
        registry.registerNpcScript({ npcId: WIZARD_MIZGOG_NPC_ID, option: undefined, handler: talk });
    },
};
