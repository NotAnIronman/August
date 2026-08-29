import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    CHILDREN_OF_THE_SUN_COMPLETE_VALUE,
    LILY_PAD_QUEST_KEY,
    STAGE_COMPLETE,
    STAGE_SPEAK_TO_BLUE_FROGS,
    VARBIT_CHILDREN_OF_THE_SUN_COMPLETE,
    VARBIT_LILY_PAD_QUEST,
} from "@server/content/gamemodes/vanilla/quests/definitions/lily-pad/constants";
import { registerLilyPadInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/lily-pad/interactions";
import { buildLilyPadJournal } from "@server/content/gamemodes/vanilla/quests/definitions/lily-pad/journal";

export { LILY_PAD_QUEST_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/lily-pad/constants";

export const lilyPadQuest: QuestDefinition = {
    key: LILY_PAD_QUEST_KEY,
    name: "The Ribbiting Tale of a Lily Pad Labour Dispute",
    members: true,
    varbitId: VARBIT_LILY_PAD_QUEST,
    startedValue: STAGE_SPEAK_TO_BLUE_FROGS,
    completionValue: STAGE_COMPLETE,
    requirements: {
        skills: [{ skillId: SkillId.Woodcutting, level: 15, label: "Woodcutting" }],
        quests: [{
            varbitId: VARBIT_CHILDREN_OF_THE_SUN_COMPLETE,
            minValue: CHILDREN_OF_THE_SUN_COMPLETE_VALUE,
            label: "Children of the Sun",
        }],
    },
    rewards: {
        questPoints: 1,
        xp: [{ skillId: SkillId.Woodcutting, amount: 2_000, label: "Woodcutting" }],
        other: ["Access to the Hardwood Farming patch at Locus Oasis"],
    },
    overviewStartText:
        "speaking to <col=800000>Marcellus<col=000080> in the <col=800000>Locus Oasis<col=000080>.",
    journalInfo: {
        difficulty: "Novice",
        length: "Very Short",
        storyline: "Standalone",
    },
    buildJournal(player, services): string[] {
        return buildLilyPadJournal(player, services, lilyPadQuest);
    },
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerLilyPadInteractions(lilyPadQuest, registry, services);
    },
};
