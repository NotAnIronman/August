import { send } from "@client/core/network/server-connection/connection/send";
import { state } from "@client/core/network/server-connection/state";

/** Requests a projectile snapshot from renderer clients for developer diagnostics. */
export function requestProjectileDebugSnapshot(
    requestId: number = Math.floor(Math.random() * 1e9),
): void {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    send({ type: "debug", payload: { kind: "projectiles_request", requestId } } as any);
}
