import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    CADAVA_POTION_ITEM_ID,
    ROMEO_AND_JULIET_KEY,
    STAGE_COMPLETE,
    STAGE_SPOKEN_TO_ROMEO,
    VARP_ROMEO_AND_JULIET,
} from "@server/content/gamemodes/vanilla/quests/definitions/romeo-and-juliet/constants";
import { registerRomeoAndJulietInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/romeo-and-juliet/interactions";
import { buildRomeoAndJulietJournal } from "@server/content/gamemodes/vanilla/quests/definitions/romeo-and-juliet/journal";

export { ROMEO_AND_JULIET_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/romeo-and-juliet/constants";

export const romeoAndJulietQuest: QuestDefinition = {
    key: ROMEO_AND_JULIET_KEY,
    name: "Romeo & Juliet",
    varpId: VARP_ROMEO_AND_JULIET,
    startedValue: STAGE_SPOKEN_TO_ROMEO,
    completionValue: STAGE_COMPLETE,
    rewards: { questPoints: 5 },
    rewardItemId: CADAVA_POTION_ITEM_ID,
    overviewStartText:
        "speaking to <col=800000>Romeo<col=000080> in <col=800000>Varrock Square<col=000080>.",
    buildJournal: buildRomeoAndJulietJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerRomeoAndJulietInteractions(romeoAndJulietQuest, registry, services);
    },
};

