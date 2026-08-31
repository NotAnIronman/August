import { state } from "@client/core/network/server-connection/state";

export function registerAnimDebugProvider(fn: (() => any) | null): void {
    state.animDebugProvider = fn;
}
