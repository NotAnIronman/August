/**
 * Lightweight, opt-in diagnostics for verbose client tracing.
 *
 * The game normally runs from a development server, so relying on NODE_ENV to
 * remove logs still leaves packet, widget, inventory, and animation traces in
 * the hottest interactive paths. Keep those traces available without paying
 * the console cost unless a developer explicitly enables them.
 *
 * Enable at build time with REACT_APP_CLIENT_DEBUG=true, or at runtime with:
 *     window.__AUGUST_CLIENT_DEBUG__ = true
 */
const BUILD_DIAGNOSTICS_ENABLED =
    String(process.env.REACT_APP_CLIENT_DEBUG ?? "").trim().toLowerCase() === "true";

type DiagnosticsGlobal = typeof globalThis & {
    __AUGUST_CLIENT_DEBUG__?: boolean;
};

export function isClientDiagnosticsEnabled(): boolean {
    return (
        BUILD_DIAGNOSTICS_ENABLED ||
        (globalThis as DiagnosticsGlobal).__AUGUST_CLIENT_DEBUG__ === true
    );
}

export function clientDebugLog(...values: unknown[]): void {
    if (!isClientDiagnosticsEnabled()) return;
    console.log(...values);
}

/** Avoids constructing snapshots or filtered arrays while diagnostics are disabled. */
export function clientDebugLogLazy(createValues: () => readonly unknown[]): void {
    if (!isClientDiagnosticsEnabled()) return;
    console.log(...createValues());
}
