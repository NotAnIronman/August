import { encodeClientMessage } from "@client/core/network/packet/ClientBinaryEncoder";
import type { ClientToServer } from "@client/core/network/server-connection/types/clientMessages";
import { state } from "@client/core/network/server-connection/state";

export function send(msg: ClientToServer): void {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    const binary = encodeClientMessage(msg as { type: string; payload: any });
    state.socket.send(binary as Uint8Array<ArrayBuffer>);
}

export function isSocketOpen(): boolean {
    return !!state.socket && state.socket.readyState === WebSocket.OPEN;
}
