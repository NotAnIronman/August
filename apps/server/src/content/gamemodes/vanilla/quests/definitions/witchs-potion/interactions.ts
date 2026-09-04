import type { PlayerState } from "@server/game/player";
import {
    registerEventSubscription,
    registerPlayerScopedCollections,
} from "@server/game/scripts/ScriptLifecycle";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { completeQuest, getQuestStage } from "@server/content/gamemodes/vanilla/quests/QuestService";
import { sayPlayer, startConversation, type DialogueContext } from "@server/content/gamemodes/vanilla/quests/dialogue";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { createHettyTalkHandler } from "@server/content/gamemodes/vanilla/quests/definitions/witchs-potion/dialogue";
import {
    HETTYS_CAULDRON_LOC_ID,
    HETTY_NPC_ID,
    RATS_TAIL_ITEM_ID,
    RAT_NPC_IDS,
    STAGE_INGREDIENTS_GIVEN,
    STAGE_STARTED,
} from "@server/content/gamemodes/vanilla/quests/definitions/witchs-potion/constants";

const knownPlayers = new Map<number, PlayerState>();

function registerRatTailDrops(
    quest: QuestDefinition,
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    const eventBus = services.system.eventBus;
    if (!eventBus) return;
    registerPlayerScopedCollections(registry, services, knownPlayers);
    registerEventSubscription(
        registry,
        eventBus.on("player:login", ({ player }) => knownPlayers.set(player.id, player)),
    );
    registerEventSubscription(
        registry,
        eventBus.on("npc:death", ({ npcTypeId, killerPlayerId, tile }) => {
            if (killerPlayerId === undefined || !RAT_NPC_IDS.some((ratId) => ratId === npcTypeId)) return;
            const player = knownPlayers.get(killerPlayerId);
            if (!player) return;
            const stage = getQuestStage(player, quest);
            if (stage !== STAGE_STARTED) return;
            if (services.inventory.findOwnedItemLocation(player, RATS_TAIL_ITEM_ID)) return;
            services.groundItems.spawn(RATS_TAIL_ITEM_ID, 1, tile, {
                ownerId: killerPlayerId,
                privateTicks: 100,
                durationTicks: 200,
                isMonsterDrop: true,
            });
        }),
    );
}

export function registerWitchsPotionInteractions(
    quest: QuestDefinition,
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    const talk = createHettyTalkHandler(quest);
    registry.registerNpcScript({ npcId: HETTY_NPC_ID, option: "talk-to", handler: talk });
    registry.registerNpcScript({ npcId: HETTY_NPC_ID, option: undefined, handler: talk });

    registry.registerLocScript({
        locId: HETTYS_CAULDRON_LOC_ID,
        action: "drink-from",
        handler: ({ player, services: eventServices }) => {
            const stage = getQuestStage(player, quest);
            if (stage === STAGE_INGREDIENTS_GIVEN) {
                eventServices.messaging.sendGameMessage(
                    player,
                    "You drink from the cauldron. It tastes horrible! You feel yourself imbued with power.",
                );
                completeQuest(player, eventServices, quest);
                return;
            }
            const context: DialogueContext = {
                player,
                services: eventServices,
                npcId: HETTY_NPC_ID,
                npcName: "Hetty",
            };
            startConversation(context, [
                sayPlayer("As nice as that looks, I think I'll give it a miss for now."),
            ]);
        },
    });

    registerRatTailDrops(quest, registry, services);
}
