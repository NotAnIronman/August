import type { PlayerState } from "@server/game/player";
import {
    NpcPreDeathDecision,
    type IScriptRegistry,
    type NpcInteractionEvent,
    type ScriptServices,
} from "@server/game/scripts/types";
import {
    completeQuest,
    getQuestStage,
    getUnmetQuestRequirements,
    setQuestStage,
} from "@server/content/gamemodes/vanilla/quests/QuestService";
import { choose, option, run, sayNpc, sayPlayer, showItem, startConversation } from "@server/content/gamemodes/vanilla/quests/dialogue";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    ITEM,
    LOC,
    NPC,
    STAGE_CHOP_ORANGE_TREE,
    STAGE_COMPLETE,
    STAGE_DEFEAT_CUTHBERT,
    STAGE_FIND_EVIDENCE,
    STAGE_FRAME_THE_FLIES,
    STAGE_NOT_STARTED,
    STAGE_PLANT_EVIDENCE,
    STAGE_REPORT_SABOTAGE,
    STAGE_REPORT_TO_MARCELLUS,
    STAGE_RETURN_TO_FROGS,
    STAGE_RETURN_TO_MARCELLUS,
    STAGE_SABOTAGE_LILY_PAD,
    STAGE_SPEAK_TO_BLUE_FROGS,
    STAGE_SPEAK_TO_FROG_LEADER,
    STAGE_SPEAK_TO_MARCELLUS_ABOUT_FLIES,
    STAGE_SPEAK_TO_ORANGE_FROGS,
    STAGE_START_CUTSCENE,
    TILE,
} from "@server/content/gamemodes/vanilla/quests/definitions/lily-pad/constants";

function context(event: NpcInteractionEvent, npcName: string) {
    return {
        player: event.player,
        services: event.services,
        npcId: event.npc.typeId,
        npcName,
    };
}

function hasCarriedItem(player: PlayerState, services: ScriptServices, itemId: number): boolean {
    return services.inventory
        .getInventoryItems(player)
        .some((entry) => entry.itemId === itemId && entry.quantity > 0);
}

function findCarriedItemSlot(
    player: PlayerState,
    services: ScriptServices,
    itemId: number,
): number | undefined {
    return services.inventory
        .getInventoryItems(player)
        .find((entry) => entry.itemId === itemId && entry.quantity > 0)?.slot;
}

function giveMissingItems(
    player: PlayerState,
    services: ScriptServices,
    itemIds: readonly number[],
): boolean {
    const missing = itemIds.filter((itemId) => !hasCarriedItem(player, services, itemId));
    if (missing.length === 0) return true;

    const freeSlots = services.inventory
        .getInventoryItems(player)
        .filter((entry) => entry.itemId <= 0 || entry.quantity <= 0).length;
    if (freeSlots < missing.length) {
        services.messaging.sendGameMessage(player, "You need more free inventory space.");
        return false;
    }

    for (const itemId of missing) {
        const added = services.inventory.addItemToInventory(player, itemId, 1);
        if (added.added !== 1) {
            services.messaging.sendGameMessage(player, "You need more free inventory space.");
            return false;
        }
    }
    services.inventory.snapshotInventory(player);
    return true;
}

function handleMarcellus(quest: QuestDefinition) {
    return (event: NpcInteractionEvent): void => {
        const stage = getQuestStage(event.player, quest);
        const ctx = context(event, "Marcellus");

        if (stage === STAGE_NOT_STARTED) {
            const unmet = getUnmetQuestRequirements(event.player, event.services, quest);
            if (unmet.length > 0) {
                startConversation(ctx, [
                    sayNpc(`Before we can discuss this, you need: ${unmet.join(", ")}.`),
                ]);
                return;
            }
            startConversation(ctx, [
                sayNpc([
                    "The frogs at Locus Oasis cannot agree on how their work should be shared.",
                    "Could you listen to both sides and help us reach an agreement?",
                ]),
                choose([
                    option("I'll help settle the dispute.", [
                        sayNpc("Thank you. Start by speaking with Sue and Gary from the blue frogs."),
                        run(({ player, services }) =>
                            setQuestStage(player, quest, services, STAGE_SPEAK_TO_BLUE_FROGS),
                        ),
                    ]),
                    option("Not right now.", [sayNpc("Come back when you are ready to help.")]),
                ]),
            ]);
            return;
        }

        if (stage === STAGE_RETURN_TO_MARCELLUS) {
            startConversation(ctx, [
                sayPlayer("I spoke with the blue frogs."),
                sayNpc("Then we should hear from their leader before making a decision."),
                run(({ player, services }) =>
                    setQuestStage(player, quest, services, STAGE_SPEAK_TO_FROG_LEADER),
                ),
            ]);
            return;
        }

        if (stage === STAGE_SPEAK_TO_MARCELLUS_ABOUT_FLIES) {
            startConversation(ctx, [
                sayNpc([
                    "The flies have been feeding both sides of this argument.",
                    "We need proof before the frogs will believe it.",
                ]),
                run(({ player, services }) =>
                    setQuestStage(player, quest, services, STAGE_FRAME_THE_FLIES),
                ),
            ]);
            return;
        }

        if (stage === STAGE_REPORT_TO_MARCELLUS) {
            startConversation(ctx, [
                sayPlayer("Cuthbert's plot is over."),
                sayNpc("Excellent work. The frogs deserve to hear the truth from their own leaders."),
                run(({ player, services }) =>
                    setQuestStage(player, quest, services, STAGE_RETURN_TO_FROGS),
                ),
            ]);
            return;
        }

        const message = stage >= STAGE_COMPLETE
            ? "The oasis is much calmer now, thanks to you."
            : "Keep following the leads from the frogs; the dispute is not settled yet.";
        startConversation(ctx, [sayNpc(message)]);
    };
}

function handleBlueFrogs(quest: QuestDefinition) {
    return (event: NpcInteractionEvent): void => {
        const stage = getQuestStage(event.player, quest);
        const ctx = context(event, "Sue and Gary");

        if (stage === STAGE_SPEAK_TO_BLUE_FROGS) {
            startConversation(ctx, [
                sayNpc("The orange frogs expect us to do all the difficult work. Marcellus must understand."),
                run(({ player, services }) =>
                    setQuestStage(player, quest, services, STAGE_RETURN_TO_MARCELLUS),
                ),
            ]);
            return;
        }
        if (stage === STAGE_SPEAK_TO_FROG_LEADER) {
            startConversation(ctx, [
                sayNpc("Jane and Dave speak for the orange frogs. They are near the orange tree."),
                run(({ player, services }) =>
                    setQuestStage(player, quest, services, STAGE_SPEAK_TO_ORANGE_FROGS),
                ),
            ]);
            return;
        }
        if (stage === STAGE_REPORT_SABOTAGE) {
            startConversation(ctx, [
                sayNpc("The lily pad is ruined! The frogs rush to see what has happened."),
                run(({ player, services }) =>
                    setQuestStage(player, quest, services, STAGE_START_CUTSCENE),
                ),
                sayNpc("The flies are using this chaos to deepen the dispute. Marcellus should know."),
                run(({ player, services }) =>
                    setQuestStage(player, quest, services, STAGE_SPEAK_TO_MARCELLUS_ABOUT_FLIES),
                ),
            ]);
            return;
        }
        if (stage === STAGE_START_CUTSCENE) {
            startConversation(ctx, [
                sayNpc("The flies have made a mess of things. Marcellus should know what they are doing."),
                run(({ player, services }) =>
                    setQuestStage(player, quest, services, STAGE_SPEAK_TO_MARCELLUS_ABOUT_FLIES),
                ),
            ]);
            return;
        }
        if (stage === STAGE_FRAME_THE_FLIES) {
            startConversation(ctx, [
                sayNpc("Search the chest nearby. It may contain something that reveals Cuthbert's plan."),
                run(({ player, services }) =>
                    setQuestStage(player, quest, services, STAGE_FIND_EVIDENCE),
                ),
            ]);
            return;
        }
        if (stage === STAGE_RETURN_TO_FROGS) {
            startConversation(ctx, [
                sayNpc("You uncovered the flies' interference. Thank you for restoring some peace to the oasis."),
                run(({ player, services }) => completeQuest(player, services, quest)),
            ]);
            return;
        }

        const message = stage >= STAGE_COMPLETE
            ? "We are getting along much better now."
            : "We still need your help with this dispute.";
        startConversation(ctx, [sayNpc(message)]);
    };
}

function handleOrangeFrogs(quest: QuestDefinition) {
    return (event: NpcInteractionEvent): void => {
        const stage = getQuestStage(event.player, quest);
        const ctx = context(event, "Jane and Dave");
        if (stage === STAGE_SPEAK_TO_ORANGE_FROGS) {
            startConversation(ctx, [
                sayNpc("The orange tree is part of the problem. Use the axe by the logs if you need one."),
                run(({ player, services }) =>
                    setQuestStage(player, quest, services, STAGE_CHOP_ORANGE_TREE),
                ),
            ]);
            return;
        }
        startConversation(ctx, [sayNpc("The orange frogs are waiting for this disagreement to end.")]);
    };
}

function spawnCuthbert(player: PlayerState, services: ScriptServices): void {
    if (services.npc.findNearbyNpc(player, NPC.cuthbert, 12)) {
        services.messaging.sendGameMessage(player, "Cuthbert is already here.");
        return;
    }
    const cuthbert = services.npc.spawnNpc({
        id: NPC.cuthbert,
        x: TILE.cuthbert.x,
        y: TILE.cuthbert.y,
        level: TILE.cuthbert.level,
        worldViewId: player.worldViewId,
        ownerPlayerId: player.id,
        lifetimeTicks: 500,
    });
    if (!cuthbert) {
        services.messaging.sendGameMessage(player, "Cuthbert does not appear. Please try again.");
        return;
    }
    services.messaging.sendGameMessage(player, "Cuthbert, Lord of Dread, emerges from the dung!");
}

export function registerLilyPadInteractions(
    quest: QuestDefinition,
    registry: IScriptRegistry,
    _services: ScriptServices,
): void {
    const marcellus = handleMarcellus(quest);
    for (const npcId of NPC.marcellus) {
        registry.registerNpcScript({ npcId, option: "talk-to", handler: marcellus });
        registry.registerNpcScript({ npcId, option: undefined, handler: marcellus });
    }

    const blueFrogs = handleBlueFrogs(quest);
    for (const npcId of NPC.blueFrogs) {
        registry.registerNpcScript({ npcId, option: "talk-to", handler: blueFrogs });
        registry.registerNpcScript({ npcId, option: undefined, handler: blueFrogs });
    }

    const orangeFrogs = handleOrangeFrogs(quest);
    for (const npcId of NPC.orangeFrogs) {
        registry.registerNpcScript({ npcId, option: "talk-to", handler: orangeFrogs });
        registry.registerNpcScript({ npcId, option: undefined, handler: orangeFrogs });
    }

    registry.registerLocScript({
        locId: LOC.logsWithAxe,
        action: "take-axe",
        handler: ({ player, services }) => {
            if (getQuestStage(player, quest) !== STAGE_CHOP_ORANGE_TREE) {
                services.messaging.sendGameMessage(player, "You have no reason to take this axe right now.");
                return;
            }
            if (!giveMissingItems(player, services, [ITEM.bronzeAxe])) return;
            services.messaging.sendGameMessage(player, "You take the bronze axe.");
        },
    });

    registry.registerLocScript({
        locId: LOC.orangeTree,
        action: "chop down",
        handler: ({ player, services }) => {
            if (getQuestStage(player, quest) !== STAGE_CHOP_ORANGE_TREE) {
                services.messaging.sendGameMessage(player, "You have no reason to chop this tree down right now.");
                return;
            }
            if (!hasCarriedItem(player, services, ITEM.bronzeAxe)) {
                services.messaging.sendGameMessage(player, "You need the bronze axe from the nearby logs.");
                return;
            }
            setQuestStage(player, quest, services, STAGE_SABOTAGE_LILY_PAD);
            services.messaging.sendGameMessage(player, "You chop down the orange tree.");
        },
    });

    registry.registerLocScript({
        locId: LOC.lilyPad,
        action: "sabotage",
        handler: ({ player, services }) => {
            if (getQuestStage(player, quest) !== STAGE_SABOTAGE_LILY_PAD) {
                services.messaging.sendGameMessage(player, "You have no reason to sabotage this lily pad right now.");
                return;
            }
            setQuestStage(player, quest, services, STAGE_REPORT_SABOTAGE);
            services.messaging.sendGameMessage(player, "You sabotage the lily pad.");
        },
    });

    registry.registerLocScript({
        locId: LOC.chest,
        action: "open",
        handler: ({ player, services }) => {
            if (getQuestStage(player, quest) !== STAGE_FIND_EVIDENCE) {
                services.messaging.sendGameMessage(player, "You find nothing useful in the chest.");
                return;
            }
            startConversation(
                { player, services, npcId: NPC.blueFrogs[0], npcName: "Sue and Gary" },
                [
                    showItem(ITEM.loveLetter, "You find a suspicious love letter and a small plushy."),
                    run(({ player: dialogPlayer, services: dialogServices }) => {
                        if (!giveMissingItems(dialogPlayer, dialogServices, [ITEM.loveLetter, ITEM.plushy])) {
                            return;
                        }
                        setQuestStage(dialogPlayer, quest, dialogServices, STAGE_PLANT_EVIDENCE);
                    }),
                ],
            );
        },
    });

    registry.registerLocScript({
        locId: LOC.dungPlantEvidence,
        action: "plant-evidence",
        handler: ({ player, services }) => {
            if (getQuestStage(player, quest) !== STAGE_PLANT_EVIDENCE) {
                services.messaging.sendGameMessage(player, "You have no evidence to plant here right now.");
                return;
            }
            const slot = findCarriedItemSlot(player, services, ITEM.plushy);
            if (slot === undefined || !services.inventory.consumeItem(player, slot)) {
                services.messaging.sendGameMessage(player, "You need the plushy from the chest first.");
                return;
            }
            services.inventory.snapshotInventory(player);
            setQuestStage(player, quest, services, STAGE_DEFEAT_CUTHBERT);
            services.messaging.sendGameMessage(player, "You plant the plushy in the capybara dung.");
        },
    });

    registry.registerLocScript({
        locId: LOC.dungInspect,
        action: "inspect",
        handler: ({ player, services }) => {
            if (getQuestStage(player, quest) !== STAGE_DEFEAT_CUTHBERT) {
                services.messaging.sendGameMessage(player, "There is nothing more to inspect here right now.");
                return;
            }
            spawnCuthbert(player, services);
        },
    });

    registry.registerNpcPreDeath(NPC.cuthbert, (event) => {
        const player = event.killer;
        if (!player || event.npc.ownerPlayerId !== player.id) return NpcPreDeathDecision.Prevent;
        if (getQuestStage(player, quest) !== STAGE_DEFEAT_CUTHBERT) {
            return NpcPreDeathDecision.Prevent;
        }
        setQuestStage(player, quest, event.services, STAGE_REPORT_TO_MARCELLUS);
        event.services.messaging.sendGameMessage(player, "You defeat Cuthbert, Lord of Dread.");
        return NpcPreDeathDecision.Allow;
    });
}
