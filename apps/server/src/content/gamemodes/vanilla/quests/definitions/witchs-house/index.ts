import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    ITEM,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_WITCHS_HOUSE,
    WITCHS_HOUSE_QUEST_KEY,
} from "@server/content/gamemodes/vanilla/quests/definitions/witchs-house/constants";
import { registerWitchsHouseInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/witchs-house/interactions";
import { buildWitchsHouseJournal } from "@server/content/gamemodes/vanilla/quests/definitions/witchs-house/journal";

export { WITCHS_HOUSE_QUEST_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/witchs-house/constants";

export const witchsHouseQuest: QuestDefinition = {
    key: WITCHS_HOUSE_QUEST_KEY,
    name: "Witch's House",
    members: true,
    varpId: VARP_WITCHS_HOUSE,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 4,
        xp: [{ skillId: SkillId.Hitpoints, amount: 6325, label: "Hitpoints" }],
    },
    rewardItemId: ITEM.ball,
    overviewStartText:
        "speaking to the <col=800000>boy<col=000080> beside the long garden north of <col=800000>Taverley<col=000080>.",
    buildJournal(player, services): string[] {
        return buildWitchsHouseJournal(player, services, witchsHouseQuest);
    },
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerWitchsHouseInteractions(witchsHouseQuest, registry, services);
    },
};
