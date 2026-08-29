import { send } from "@client/core/network/server-connection/connection/send";
import { state } from "@client/core/network/server-connection/state";

export function sendEmote(index: number, loop: boolean = false): void {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    const idx = Math.max(0, index | 0);
    send({ type: "emote", payload: { index: idx, loop: !!loop } } as any);
}
