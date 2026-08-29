import { send } from "@client/core/network/server-connection/connection/send";
import { state } from "@client/core/network/server-connection/state";

export function sendFaceRot(rot: number): void {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    send({ type: "face", payload: { rot: rot | 0 } } as any);
}

export function sendFaceTile(tile: { x: number; y: number }): void {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    send({ type: "face", payload: { tile: { x: tile.x | 0, y: tile.y | 0 } } } as any);
}
