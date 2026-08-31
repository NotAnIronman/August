/**
 * Port Sarim sailors → Musa Point (LostCity / OSRS Captain Tobias dialogue).
 */
import type { IScriptRegistry, NpcInteractionEvent } from "@server/game/scripts/types";
import {
    choose,
    option,
    registerNpcOptions,
    registerTalkTo,
    run,
    sayNpc,
    sayPlayer,
    startNpcConversation,
} from "@server/content/gamemodes/vanilla/npcs/npcInteractions";
import { FARE_COINS, MUSA_POINT, PORT_SARIM_SAILOR_IDS } from "@server/content/gamemodes/vanilla/scripts/content/travel/boats/constants";
import { sailTo, tryPayFare } from "@server/content/gamemodes/vanilla/scripts/content/travel/boats/fare";

function offerTrip(event: NpcInteractionEvent): void {
    startNpcConversation(event, [
        sayNpc([
            "Hello there. Do you want to go on a trip to Karamja?",
            `We can take you to Musa Point for only ${FARE_COINS} coins.`,
        ]),
        choose([
            option("Yes please.", [
                run((ctx) => {
                    if (tryPayFare(ctx.player, ctx.services) === "poor") {
                        // Wait until this conversation ends before starting a new one.
                        setImmediate(() => {
                            startNpcConversation(event, [
                                sayPlayer("Oh dear, I don't seem to have enough money."),
                            ]);
                        });
                        return;
                    }
                    sailTo(
                        ctx.player,
                        ctx.services,
                        MUSA_POINT,
                        `You pay ${FARE_COINS} coins and board the ship.`,
                    );
                }),
            ]),
            option("No, thank you."),
        ]),
    ]);
}

export function registerPortSarimSailors(registry: IScriptRegistry): void {
    const ids = [...PORT_SARIM_SAILOR_IDS];
    registerTalkTo(registry, ids, offerTrip);
    registerNpcOptions(registry, ids, ["pay-fare", "pay fare"], offerTrip);
}
