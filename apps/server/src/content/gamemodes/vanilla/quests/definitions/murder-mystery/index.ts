import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    ITEM,
    MURDER_MYSTERY_QUEST_KEY,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_MURDER_MYSTERY,
} from "@server/content/gamemodes/vanilla/quests/definitions/murder-mystery/constants";
import { registerMurderMysteryInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/murder-mystery/interactions";
import { buildMurderMysteryJournal } from "@server/content/gamemodes/vanilla/quests/definitions/murder-mystery/journal";

export const murderMysteryQuest: QuestDefinition = {
    key: MURDER_MYSTERY_QUEST_KEY,
    name: "Murder Mystery",
    members: true,
    varpId: VARP_MURDER_MYSTERY,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 3,
        xp: [{ skillId: SkillId.Crafting, amount: 1_406, label: "Crafting" }],
        items: [{ itemId: ITEM.coins, quantity: 2_000, label: "Coins" }],
    },
    rewardItemId: ITEM.coins,
    overviewStartText: "speaking to a <col=800000>guard<col=000080> outside the Sinclair Mansion.",
    buildJournal(player, services): string[] {
        return buildMurderMysteryJournal(player, services, murderMysteryQuest);
    },
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerMurderMysteryInteractions(murderMysteryQuest, registry, services);
    },
};
