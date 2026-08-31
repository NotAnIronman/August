/**
 * Handler registry - combines all opcode handlers
 */
import { registerChatOps } from "@client/engine/cs2/handlers/ChatOps";
import { registerClanOps } from "@client/engine/cs2/handlers/ClanOps";
import { registerClientOps } from "@client/engine/cs2/handlers/ClientOps";
import { registerConfigOps } from "@client/engine/cs2/handlers/ConfigOps";
import { registerCoreOps } from "@client/engine/cs2/handlers/CoreOps";
import { registerDbOps } from "@client/engine/cs2/handlers/DbOps";
import type { HandlerMap } from "@client/engine/cs2/handlers/HandlerTypes";
import { registerMarketOps } from "@client/engine/cs2/handlers/MarketOps";
import { registerMathOps } from "@client/engine/cs2/handlers/MathOps";
import { registerSocialOps } from "@client/engine/cs2/handlers/SocialOps";
import { registerStringOps } from "@client/engine/cs2/handlers/StringOps";
import { registerVarOps } from "@client/engine/cs2/handlers/VarOps";
import { registerWidgetEventOps } from "@client/engine/cs2/handlers/WidgetEventOps";
import { registerWidgetOps } from "@client/engine/cs2/handlers/WidgetOps";
import { registerWorldListOps } from "@client/engine/cs2/handlers/WorldListOps";
import { registerWorldMapOps } from "@client/engine/cs2/handlers/WorldMapOps";

export * from "@client/engine/cs2/handlers/HandlerTypes";

/** Create a handler map with all registered handlers */
export function createHandlerMap(): HandlerMap {
    const handlers: HandlerMap = new Map();

    registerCoreOps(handlers);
    registerMathOps(handlers);
    registerStringOps(handlers);
    registerVarOps(handlers);
    registerWidgetOps(handlers);
    registerWidgetEventOps(handlers);
    registerClientOps(handlers);
    registerConfigOps(handlers);
    registerSocialOps(handlers);
    registerChatOps(handlers);
    registerClanOps(handlers);
    registerWorldMapOps(handlers);
    registerMarketOps(handlers);
    registerDbOps(handlers);
    registerWorldListOps(handlers);

    return handlers;
}
