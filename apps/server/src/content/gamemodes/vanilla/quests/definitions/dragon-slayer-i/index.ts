import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { DRAGON_SLAYER_I_QUEST_KEY, ITEM, STAGE_COMPLETE, STAGE_GUILDMASTER, VARP_DRAGON_SLAYER } from "@server/content/gamemodes/vanilla/quests/definitions/dragon-slayer-i/constants";
import { registerDragonSlayerIInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/dragon-slayer-i/interactions";
import { buildDragonSlayerIJournal } from "@server/content/gamemodes/vanilla/quests/definitions/dragon-slayer-i/journal";

export const dragonSlayerIQuest: QuestDefinition = {
    key: DRAGON_SLAYER_I_QUEST_KEY,
    name: "Dragon Slayer I",
    members: false,
    varpId: VARP_DRAGON_SLAYER,
    startedValue: STAGE_GUILDMASTER,
    completionValue: STAGE_COMPLETE,
    requirements: { questPoints: 32 },
    rewards: {
        questPoints: 2,
        xp: [
            { skillId: SkillId.Strength, amount: 18_650, label: "Strength" },
            { skillId: SkillId.Defence, amount: 18_650, label: "Defence" },
        ],
        other: ["The right to wear rune platebodies and green dragonhide bodies", "Access to Crandor"],
    },
    rewardItemId: ITEM.antiDragonShield,
    overviewStartText: "speaking to the <col=800000>Guildmaster<col=000080> in the Champions' Guild.",
    buildJournal: buildDragonSlayerIJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerDragonSlayerIInteractions(dragonSlayerIQuest, registry, services);
    },
};
