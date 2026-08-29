import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    DRUIDIC_RITUAL_QUEST_KEY,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_DRUIDIC_RITUAL,
} from "@server/content/gamemodes/vanilla/quests/definitions/druidic-ritual/constants";
import { registerDruidicRitualInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/druidic-ritual/interactions";
import { buildDruidicRitualJournal } from "@server/content/gamemodes/vanilla/quests/definitions/druidic-ritual/journal";

export { DRUIDIC_RITUAL_QUEST_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/druidic-ritual/constants";

export const druidicRitualQuest: QuestDefinition = {
    key: DRUIDIC_RITUAL_QUEST_KEY,
    name: "Druidic Ritual",
    members: true,
    varpId: VARP_DRUIDIC_RITUAL,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 4,
        xp: [{ skillId: SkillId.Herblore, amount: 250, label: "Herblore" }],
        other: ["Access to the Herblore skill"],
    },
    overviewStartText:
        "speaking to <col=800000>Kaqemeex<col=000080> at the stone circle north of <col=800000>Taverley<col=000080>.",
    buildJournal: buildDruidicRitualJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerDruidicRitualInteractions(druidicRitualQuest, registry, services);
    },
};
