import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    ERNEST_THE_CHICKEN_QUEST_KEY,
    ITEM,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_ERNEST,
} from "@server/content/gamemodes/vanilla/quests/definitions/ernest-the-chicken/constants";
import { registerErnestTheChickenInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/ernest-the-chicken/interactions";
import { buildErnestTheChickenJournal } from "@server/content/gamemodes/vanilla/quests/definitions/ernest-the-chicken/journal";

export { ERNEST_THE_CHICKEN_QUEST_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/ernest-the-chicken/constants";
export { getErnestPuzzleDoorStates } from "@server/content/gamemodes/vanilla/quests/definitions/ernest-the-chicken/interactions";

export const ernestTheChickenQuest: QuestDefinition = {
    key: ERNEST_THE_CHICKEN_QUEST_KEY,
    name: "Ernest the Chicken",
    varpId: VARP_ERNEST,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 4,
        items: [{ itemId: ITEM.coins, quantity: 300, label: "300 Coins" }],
    },
    rewardItemId: ITEM.coins,
    overviewStartText:
        "speaking to <col=800000>Veronica<col=000080> outside <col=800000>Draynor Manor<col=000080>.",
    buildJournal: buildErnestTheChickenJournal,
    register(registry: IScriptRegistry, _services: ScriptServices): void {
        registerErnestTheChickenInteractions(ernestTheChickenQuest, registry);
    },
};
