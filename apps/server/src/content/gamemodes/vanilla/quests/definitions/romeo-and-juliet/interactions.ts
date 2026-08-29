import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    createApothecaryTalkHandler,
    createFatherLawrenceTalkHandler,
} from "@server/content/gamemodes/vanilla/quests/definitions/romeo-and-juliet/fatherApothecaryDialogue";
import { giveItem } from "@server/content/gamemodes/vanilla/quests/definitions/romeo-and-juliet/items";
import { createJulietTalkHandler, createRomeoTalkHandler } from "@server/content/gamemodes/vanilla/quests/definitions/romeo-and-juliet/romeoJulietDialogue";
import {
    APOTHECARY_NPC_ID,
    CADAVA_BERRIES_ITEM_ID,
    CADAVA_BUSH_LOC_IDS,
    FATHER_LAWRENCE_NPC_ID,
    JULIET_NPC_IDS,
    ROMEO_NPC_ID,
} from "@server/content/gamemodes/vanilla/quests/definitions/romeo-and-juliet/constants";

export function registerRomeoAndJulietInteractions(
    quest: QuestDefinition,
    registry: IScriptRegistry,
    _services: ScriptServices,
): void {
    const romeoTalk = createRomeoTalkHandler(quest);
    registry.registerNpcScript({ npcId: ROMEO_NPC_ID, option: "talk-to", handler: romeoTalk });
    registry.registerNpcScript({ npcId: ROMEO_NPC_ID, option: undefined, handler: romeoTalk });

    const julietTalk = createJulietTalkHandler(quest);
    for (const npcId of JULIET_NPC_IDS) {
        registry.registerNpcScript({ npcId, option: "talk-to", handler: julietTalk });
        registry.registerNpcScript({ npcId, option: undefined, handler: julietTalk });
    }

    const fatherTalk = createFatherLawrenceTalkHandler(quest);
    registry.registerNpcScript({
        npcId: FATHER_LAWRENCE_NPC_ID,
        option: "talk-to",
        handler: fatherTalk,
    });
    registry.registerNpcScript({
        npcId: FATHER_LAWRENCE_NPC_ID,
        option: undefined,
        handler: fatherTalk,
    });

    const apothecaryTalk = createApothecaryTalkHandler(quest);
    registry.registerNpcScript({
        npcId: APOTHECARY_NPC_ID,
        option: "talk-to",
        handler: apothecaryTalk,
    });
    registry.registerNpcScript({
        npcId: APOTHECARY_NPC_ID,
        option: "potions",
        handler: apothecaryTalk,
    });
    registry.registerNpcScript({
        npcId: APOTHECARY_NPC_ID,
        option: undefined,
        handler: apothecaryTalk,
    });

    for (const locId of CADAVA_BUSH_LOC_IDS) {
        registry.registerLocScript({
            locId,
            action: "pick-from",
            handler: ({ player, services }) => {
                if (!giveItem(player, services, CADAVA_BERRIES_ITEM_ID)) {
                    services.messaging.sendGameMessage(
                        player,
                        "You do not have room for any Cadava berries.",
                    );
                    return;
                }
                services.messaging.sendGameMessage(player, "You pick some Cadava berries.");
            },
        });
    }
}

