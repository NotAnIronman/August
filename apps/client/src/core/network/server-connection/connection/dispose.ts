import { WS_GLOBAL_KEY, WS_SUPPRESS_RECONNECT_KEY } from "@client/core/network/server-connection/constants";
import { clearLoginConnectRetryTimer } from "@client/core/network/server-connection/connection/loginHelpers";
import { createDefaultTradeState } from "@client/core/network/server-connection/domain/defaults";
import { state } from "@client/core/network/server-connection/state";

export function disposeServerConnection(reason: string = "hmr refresh"): void {
    try {
        // Prevent any in-flight reconnect timers
        try {
            if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
        } catch {}
        state.reconnectTimer = null;
        clearLoginConnectRetryTimer();
        if (
            state.socket &&
            (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)
        ) {
            try {
                state.socket.close(1000, reason);
            } catch {}
        }
    } finally {
        try {
            const g: any = (typeof window !== "undefined" ? window : globalThis) as any;
            if (g[WS_GLOBAL_KEY] === state.socket) g[WS_GLOBAL_KEY] = null;
            g[WS_SUPPRESS_RECONNECT_KEY] = true;
        } catch {}
        state.lastInventorySnapshot = undefined;
        state.lastCollectionLogSnapshot = undefined;
        state.lastCollectionLogCategoryCompletion = undefined;
        state.lastTradeState = createDefaultTradeState();
        state.lastGroundItems = undefined;
    }
}
