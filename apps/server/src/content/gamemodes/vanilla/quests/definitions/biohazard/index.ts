import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { BIOHAZARD_QUEST_KEY, STAGE_COMPLETE, STAGE_STARTED, VARP_BIOHAZARD } from "@server/content/gamemodes/vanilla/quests/definitions/biohazard/constants";
import { registerBiohazardInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/biohazard/interactions";
import { buildBiohazardJournal } from "@server/content/gamemodes/vanilla/quests/definitions/biohazard/journal";

export const biohazardQuest: QuestDefinition = {
    key: BIOHAZARD_QUEST_KEY,
    name: "Biohazard",
    members: true,
    varpId: VARP_BIOHAZARD,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    requirements: {
        quests: [{ varpId: 165, minValue: 29, label: "Plague City" }],
    },
    rewards: {
        questPoints: 3,
        xp: [{ skillId: SkillId.Thieving, amount: 1_250, label: "Thieving" }],
        other: ["Access to the Combat Training Camp", "Free passage through West Ardougne's gate"],
    },
    overviewStartText: "speaking to <col=800000>Elena<col=000080> in East Ardougne after Plague City.",
    buildJournal: buildBiohazardJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerBiohazardInteractions(biohazardQuest, registry, services);
    },
};

