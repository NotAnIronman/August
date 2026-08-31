import type { MessageHandlerServices } from "@server/network/MessageHandlers";
import type { MessageHandler } from "@server/network/MessageRouter";

export function createIfCloseHandler(services: MessageHandlerServices): MessageHandler<"if_close"> {
    return (ctx) => {
        const player = services.getPlayer(ctx.ws);
        if (player) {
            services.closeInterruptibleInterfaces(player);
        }
    };
}
