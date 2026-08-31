import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { QUEST_KEYS, QUEST_STATE } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-series/constants";
import { ITEM } from "@server/content/gamemodes/vanilla/quests/definitions/troll-stronghold/constants";
import { registerTrollStrongholdInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/troll-stronghold/interactions";
import { buildTrollStrongholdJournal } from "@server/content/gamemodes/vanilla/quests/definitions/troll-stronghold/journal";

export const trollStrongholdQuest: QuestDefinition = {
    key: QUEST_KEYS.trollStronghold,
    name: "Troll Stronghold",
    members: true,
    varpId: QUEST_STATE[QUEST_KEYS.trollStronghold].varpId,
    startedValue: 10,
    completionValue: QUEST_STATE[QUEST_KEYS.trollStronghold].completionValue,
    rewards: {
        questPoints: 1,
        items: [{ itemId: ITEM.lawTalisman, quantity: 1, label: "Law talisman" }],
        other: ["Access to the Troll Stronghold"],
    },
    rewardItemId: ITEM.lawTalisman,
    overviewStartText: "speaking to <col=800000>Denulth<col=000080> after Death Plateau.",
    buildJournal: buildTrollStrongholdJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerTrollStrongholdInteractions(trollStrongholdQuest, registry, services);
    },
};
