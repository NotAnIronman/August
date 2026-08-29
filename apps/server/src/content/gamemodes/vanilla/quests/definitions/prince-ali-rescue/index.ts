import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    COINS_ITEM_ID,
    PRINCE_ALI_RESCUE_KEY,
    QUEST_REWARD_COINS,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_PRINCE_ALI_RESCUE,
} from "@server/content/gamemodes/vanilla/quests/definitions/prince-ali-rescue/constants";
import { registerPrinceAliRescueInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/prince-ali-rescue/interactions";
import { buildPrinceAliRescueJournal } from "@server/content/gamemodes/vanilla/quests/definitions/prince-ali-rescue/journal";

export { PRINCE_ALI_RESCUE_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/prince-ali-rescue/constants";

export const princeAliRescueQuest: QuestDefinition = {
    key: PRINCE_ALI_RESCUE_KEY,
    name: "Prince Ali Rescue",
    varpId: VARP_PRINCE_ALI_RESCUE,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 3,
        items: [{ itemId: COINS_ITEM_ID, quantity: QUEST_REWARD_COINS, label: "700 Coins" }],
        other: ["Free passage through the Al Kharid gate"],
    },
    rewardItemId: COINS_ITEM_ID,
    overviewStartText:
        "speaking to <col=800000>Chancellor Hassan<col=000080> in <col=800000>Al Kharid Palace<col=000080>.",
    buildJournal: (player, services) =>
        buildPrinceAliRescueJournal(princeAliRescueQuest, player, services),
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerPrinceAliRescueInteractions(princeAliRescueQuest, registry, services);
    },
};
