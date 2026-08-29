import type { MessageHandlerServices } from "@server/network/MessageHandlers";
import type { MessageRouter } from "@server/network/MessageRouter";
import { type BinaryHandlerExtServices, registerBinaryHandlers } from "@server/network/handlers/binaryMessageHandlers";
import { registerChatHandler } from "@server/network/handlers/chatHandler";
import { registerDebugHandler } from "@server/network/handlers/debugHandler";
import { registerDialogHandlers } from "@server/network/handlers/dialogHandlers";
import { createIfCloseHandler } from "@server/network/handlers/ifCloseHandler";
import { registerInteractHandlers } from "@server/network/handlers/interactHandlers";
import { createLogoutHandler } from "@server/network/handlers/logoutHandler";
import { registerMovementHandlers } from "@server/network/handlers/movementHandlers";
import { registerNpcHandlers } from "@server/network/handlers/npcHandlers";
import { registerSpellHandlers } from "@server/network/handlers/spellHandlers";
import { createVarpTransmitHandler } from "@server/network/handlers/varpTransmitHandler";
import { createWidgetHandler } from "@server/network/handlers/widgetHandler";

export type { BinaryHandlerExtServices };

/**
 * Registers ALL message handlers with the router.
 * This is the single entry point for handler registration.
 *
 * To add a new handler:
 * 1. Create a handler file in this directory
 * 2. Export a registerXxxHandlers(router, services) function
 * 3. Register it here
 */
export function registerAllHandlers(
    router: MessageRouter,
    services: BinaryHandlerExtServices,
): void {
    // Gameplay handlers (extracted from MessageHandlers.ts)
    registerInteractHandlers(router, services);
    registerDialogHandlers(router, services);
    registerMovementHandlers(router, services);
    registerNpcHandlers(router, services);
    registerSpellHandlers(router, services);
    registerDebugHandler(router, services);
    registerChatHandler(router, services);

    // Extracted from onConnection if-else chain
    router.register("logout", createLogoutHandler(services));
    router.register("if_close", createIfCloseHandler(services));
    router.register("widget", createWidgetHandler(services));
    router.register("varp_transmit", createVarpTransmitHandler(services));

    // Extracted from processBinaryMessage switch
    registerBinaryHandlers(router, services);
}
