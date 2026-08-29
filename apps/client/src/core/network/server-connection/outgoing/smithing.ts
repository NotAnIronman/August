import { send } from "@client/core/network/server-connection/connection/send";
import { state } from "@client/core/network/server-connection/state";

export function sendSmithingMake(recipeId: string, mode: "smelt" | "forge"): void {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    if (typeof recipeId !== "string" || recipeId.length === 0) return;
    send({ type: "smithing_make", payload: { recipeId, mode } } as any);
}

export function sendSmithingSetMode(mode: number, customAmount?: number): void {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
    if (!Number.isFinite(mode)) return;
    const payload: { mode: number; custom?: number } = {
        mode: Math.max(0, Math.min(4, mode | 0)),
    };
    if (Number.isFinite(customAmount) && (customAmount as number) > 0) {
        payload.custom = Math.max(1, Math.min(2147483647, (customAmount as number) | 0));
    }
    send({ type: "smithing_mode", payload } as any);
}
