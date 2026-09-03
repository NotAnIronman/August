
import { handleAuthTickMessage } from "@client/core/network/server-connection/handlers/authTick";
import { handleInboundSync } from "@client/core/network/server-connection/handlers/inboundSync";
import { handleInboundUi } from "@client/core/network/server-connection/handlers/inboundUi";
import { handleInboundWorld } from "@client/core/network/server-connection/handlers/inboundWorld";

export function processServerMessage(msg: any): void {
    if (handleAuthTickMessage(msg)) return;
    if (handleInboundSync(msg)) return;
    if (handleInboundUi(msg)) return;
    handleInboundWorld(msg);
}
