import { getConfiguredServers } from "@client/core/config/clientEnv";
import { fetchWithTimeout } from "@client/core/network/fetchWithTimeout";
import { readBoundedJsonResponse } from "@client/core/network/BoundedResponse";
import { SERVER_LIST_URL } from "@client/features/login/renderer/constants";
import type { LoginRendererHost } from "@client/features/login/renderer/host";
import type { ServerListEntry } from "@client/features/login/renderer/types";
import { mapWithConcurrency } from "@august/osrs-engine/util/AsyncConcurrency";

export const MAX_SERVER_LIST_ENTRIES = 256;
const SERVER_PROBE_CONCURRENCY = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidServerAddress(value: string): boolean {
        const address = value.trim();
        if (!address || address.length > 512 || /[\s/\\@?#]/.test(address)) return false;
        try {
            const parsed = new URL(`ws://${address}`);
            return !!parsed.hostname && parsed.username === "" && parsed.password === "";
        } catch {
            return false;
        }
}

/** Normalize an untrusted public server list before rendering or probing it. */
export function parseServerListEntries(value: unknown): ServerListEntry[] {
        if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SERVER_LIST_ENTRIES) {
            return [];
        }
        const result: ServerListEntry[] = [];
        for (const [index, raw] of value.entries()) {
            if (!isRecord(raw) || typeof raw.address !== "string" || !isValidServerAddress(raw.address)) {
                continue;
            }
            const id =
                typeof raw.id === "number" && Number.isSafeInteger(raw.id) && raw.id >= 0
                    ? raw.id
                    : index + 1;
            const name =
                typeof raw.name === "string" && raw.name.trim() && raw.name.length <= 128
                    ? raw.name.trim()
                    : "Unknown";
            const activity =
                typeof raw.activity === "string" && raw.activity.length <= 256
                    ? raw.activity
                    : "";
            const maxPlayers =
                typeof raw.maxPlayers === "number" &&
                Number.isSafeInteger(raw.maxPlayers) &&
                raw.maxPlayers >= 1 &&
                raw.maxPlayers <= 2_047
                    ? raw.maxPlayers
                    : 2_047;
            const location =
                typeof raw.location === "number" && Number.isSafeInteger(raw.location)
                    ? raw.location
                    : 0;
            const properties =
                typeof raw.properties === "number" && Number.isSafeInteger(raw.properties)
                    ? raw.properties
                    : 0;
            result.push({
                id,
                name,
                activity,
                address: raw.address.trim(),
                secure: raw.secure === true,
                playerCount: null,
                maxPlayers,
                location,
                properties,
            });
        }
        return result;
}

function filterServersForCurrentHost(servers: ServerListEntry[]) {

        if (typeof window === "undefined") return servers;
        const pageHost = window.location.hostname.toLowerCase();
        const pageIsLocal =
            pageHost === "localhost" ||
            pageHost === "127.0.0.1" ||
            pageHost === "[::1]" ||
            pageHost === "::1";
        if (pageIsLocal) return servers;

        return servers.filter((s) => {
            const address = s.address.trim().toLowerCase();
            return !(
                address === "localhost" ||
                address.startsWith("localhost:") ||
                address === "127.0.0.1" ||
                address.startsWith("127.0.0.1:") ||
                address === "[::1]" ||
                address.startsWith("[::1]:") ||
                address === "::1"
            );
        });
    
}

function probeWebSocket(url: string, timeoutMs: number, signal?: AbortSignal) {

        return new Promise<boolean>((resolve) => {
            if (signal?.aborted) {
                resolve(false);
                return;
            }
            let settled = false;
            let ws: WebSocket;
            try {
                ws = new WebSocket(url);
            } catch {
                resolve(false);
                return;
            }
            let timer: ReturnType<typeof setTimeout> | undefined;
            const finish = (alive: boolean) => {
                if (settled) return;
                settled = true;
                if (timer !== undefined) clearTimeout(timer);
                signal?.removeEventListener("abort", handleAbort);
                ws.removeEventListener("open", handleOpen);
                ws.removeEventListener("error", handleError);
                try {
                    ws.close();
                } catch {}
                resolve(alive);
            };
            const handleOpen = () => finish(true);
            const handleError = () => finish(false);
            const handleAbort = () => finish(false);
            timer = setTimeout(() => finish(false), timeoutMs);
            ws.addEventListener("open", handleOpen);
            ws.addEventListener("error", handleError);
            signal?.addEventListener("abort", handleAbort, { once: true });
        });
    
}

export async function fetchServerList(host: LoginRendererHost): Promise<void> {

        if (host.serverListFetched) return;
        const signal = host.lifecycleAbortController.signal;
        if (signal.aborted) return;

        const configured = getConfiguredServers();
        if (configured && configured.length > 0) {
            host.serverList = filterServersForCurrentHost(
                parseServerListEntries(configured.map((s) => ({
                    id: s.id,
                    name: s.name,
                    activity: s.activity,
                    address: s.address,
                    secure: s.secure,
                    playerCount: null,
                    maxPlayers: s.maxPlayers,
                    location: 0,
                    properties: 0,
                }))),
            );
            host.serverListFetched = true;
            return;
        }

        try {
            const res = await fetchWithTimeout(SERVER_LIST_URL, 5000, { signal });
            if (res.ok) {
                const data = await readBoundedJsonResponse(res, 256 * 1024);
                if (signal.aborted) return;
                const parsed = parseServerListEntries(data);
                if (parsed.length > 0) {
                    host.serverList = filterServersForCurrentHost(
                        parsed,
                    );
                }
            }
        } catch {
            // keep fallback
        }
        if (!signal.aborted) host.serverListFetched = true;
    
}

export function refreshServerList(host: LoginRendererHost) {

        if (host.probing) return;
        const signal = host.lifecycleAbortController.signal;
        if (signal.aborted) return;
        host.probed = false;
        host.probing = true;

        const probes = mapWithConcurrency(
            host.serverList.slice(0, MAX_SERVER_LIST_ENTRIES),
            SERVER_PROBE_CONCURRENCY,
            async (server) => {
                if (signal.aborted) return;
                const protocol = server.secure ? "https" : "http";
                let httpOk = false;
                try {
                    const res = await fetchWithTimeout(
                        `${protocol}://${server.address}/status`,
                        8000,
                        { signal },
                    );
                    if (res.ok) {
                        const data = await readBoundedJsonResponse(res, 64 * 1024);
                        if (signal.aborted) return;
                        const status =
                            data && typeof data === "object"
                                ? (data as Record<string, unknown>)
                                : undefined;
                        server.playerCount =
                            typeof status?.playerCount === "number" &&
                            Number.isSafeInteger(status.playerCount) &&
                            status.playerCount >= 0 &&
                            status.playerCount <= 2_047
                                ? status.playerCount
                                : null;
                        if (
                            typeof status?.maxPlayers === "number" &&
                            Number.isSafeInteger(status.maxPlayers) &&
                            status.maxPlayers >= 1 &&
                            status.maxPlayers <= 2_047
                        ) {
                            server.maxPlayers = status.maxPlayers;
                        }
                        httpOk = true;
                    }
                } catch {
                    /* fall through to ws probe */
                }

                if (!httpOk) {
                    const wsProto = server.secure ? "wss" : "ws";
                    const alive = await probeWebSocket(
                        `${wsProto}://${server.address}`,
                        5000,
                        signal,
                    );
                    if (signal.aborted) return;
                    server.playerCount = alive ? -1 : null;
                }
            },
        );

        const finish = () => {
            host.probing = false;
            if (!signal.aborted) host.probed = true;
        };
        void probes.then(finish, finish);
    
}
