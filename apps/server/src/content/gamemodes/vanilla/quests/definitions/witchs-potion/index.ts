import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    EYE_OF_NEWT_ITEM_ID,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_WITCHS_POTION,
    WITCHS_POTION_KEY,
} from "@server/content/gamemodes/vanilla/quests/definitions/witchs-potion/constants";
import { registerWitchsPotionInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/witchs-potion/interactions";
import { buildWitchsPotionJournal } from "@server/content/gamemodes/vanilla/quests/definitions/witchs-potion/journal";

export { WITCHS_POTION_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/witchs-potion/constants";

export const witchsPotionQuest: QuestDefinition = {
    key: WITCHS_POTION_KEY,
    name: "Witch's Potion",
    varpId: VARP_WITCHS_POTION,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 1,
        xp: [{ skillId: SkillId.Magic, amount: 325, label: "Magic" }],
    },
    rewardItemId: EYE_OF_NEWT_ITEM_ID,
    overviewStartText:
        "speaking to <col=800000>Hetty<col=000080> in her house in <col=800000>Rimmington<col=000080>.",
    buildJournal: buildWitchsPotionJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerWitchsPotionInteractions(witchsPotionQuest, registry, services);
    },
};

