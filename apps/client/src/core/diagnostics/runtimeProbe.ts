import { send } from "@client/core/network/ServerConnection";

type ProbeValue = string | number | boolean | null | undefined | ProbeValue[] | { [key: string]: ProbeValue };

const MAX_TEXT_LENGTH = 320;
const MAX_COLLECTION_SIZE = 20;

function sanitize(value: unknown, depth: number = 0): ProbeValue {
    if (value === null || value === undefined) return value;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
    if (typeof value === "string") return value.slice(0, MAX_TEXT_LENGTH);
    if (depth >= 3) return "[truncated]";
    if (Array.isArray(value)) {
        return value.slice(0, MAX_COLLECTION_SIZE).map((entry) => sanitize(entry, depth + 1));
    }
    if (typeof value === "object") {
        const result: Record<string, ProbeValue> = {};
        for (const [key, entry] of Object.entries(value).slice(0, MAX_COLLECTION_SIZE)) {
            result[String(key).slice(0, 80)] = sanitize(entry, depth + 1);
        }
        return result;
    }
    return String(value).slice(0, MAX_TEXT_LENGTH);
}

/**
 * Mirrors a focused browser diagnostic into the project through the connected
 * game server. The server persists it in the ignored local file
 * server/logs/runtime-probe.log for direct inspection without console copy/paste.
 */
export function reportRuntimeProbe(event: string, details: Record<string, unknown> = {}): void {
    const payload = {
        kind: "runtime_probe",
        event: String(event).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80),
        details: sanitize(details),
    };
    console.info(`[runtime-probe] ${payload.event}`, payload.details);
    try {
        send({ type: "debug", payload } as any);
    } catch {
        // Diagnostics must never affect a game interaction when offline.
    }
}
