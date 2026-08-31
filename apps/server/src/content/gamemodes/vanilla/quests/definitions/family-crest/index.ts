import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    FAMILY_CREST_QUEST_KEY,
    ITEM,
    STAGE_COMPLETE,
    STAGE_SPOKEN_DIMINTHEIS,
    VARP_FAMILY_CREST,
} from "@server/content/gamemodes/vanilla/quests/definitions/family-crest/constants";
import { registerFamilyCrestInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/family-crest/interactions";
import { buildFamilyCrestJournal } from "@server/content/gamemodes/vanilla/quests/definitions/family-crest/journal";

export const familyCrestQuest: QuestDefinition = {
    key: FAMILY_CREST_QUEST_KEY,
    name: "Family Crest",
    members: true,
    varpId: VARP_FAMILY_CREST,
    startedValue: STAGE_SPOKEN_DIMINTHEIS,
    completionValue: STAGE_COMPLETE,
    requirements: {
        skills: [
            { skillId: SkillId.Mining, level: 40, label: "Mining" },
            { skillId: SkillId.Smithing, level: 40, label: "Smithing" },
            { skillId: SkillId.Magic, level: 59, label: "Magic" },
            { skillId: SkillId.Crafting, level: 40, label: "Crafting" },
        ],
    },
    rewards: {
        questPoints: 1,
        items: [{ itemId: ITEM.steelGauntlets, quantity: 1, label: "Steel gauntlets" }],
        other: ["The ability to enchant the gauntlets"],
    },
    rewardItemId: ITEM.steelGauntlets,
    overviewStartText: "speaking to <col=800000>Dimintheis<col=000080> in south-east Varrock.",
    buildJournal(player, services): string[] {
        return buildFamilyCrestJournal(player, services, familyCrestQuest);
    },
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerFamilyCrestInteractions(familyCrestQuest, registry, services);
    },
};
