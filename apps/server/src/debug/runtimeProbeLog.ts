import fs from "fs";
import path from "path";

import { serverVarPath } from "@server/paths";

const LOG_PATH = serverVarPath("logs", "runtime-probe.log");
const MAX_LOG_BYTES = 256 * 1024;
const MAX_EVENT_LENGTH = 80;
const MAX_TEXT_LENGTH = 320;
const MAX_COLLECTION_SIZE = 20;

function sanitize(value: unknown, depth: number = 0): unknown {
    if (value === null || value === undefined || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
    if (typeof value === "string") return value.slice(0, MAX_TEXT_LENGTH);
    if (depth >= 3) return "[truncated]";
    if (Array.isArray(value)) return value.slice(0, MAX_COLLECTION_SIZE).map((entry) => sanitize(entry, depth + 1));
    if (typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, MAX_COLLECTION_SIZE)) {
            out[key.slice(0, 80)] = sanitize(entry, depth + 1);
        }
        return out;
    }
    return String(value).slice(0, MAX_TEXT_LENGTH);
}

function trimLogIfNeeded(): void {
    try {
        if (!fs.existsSync(LOG_PATH) || fs.statSync(LOG_PATH).size <= MAX_LOG_BYTES) return;
        const existing = fs.readFileSync(LOG_PATH, "utf8");
        const retained = existing.slice(-(MAX_LOG_BYTES >> 1));
        const firstNewline = retained.indexOf("\n");
        fs.writeFileSync(LOG_PATH, `${firstNewline >= 0 ? retained.slice(firstNewline + 1) : retained}`, "utf8");
    } catch {
        // This is strictly diagnostic; failed log maintenance must be harmless.
    }
}

/** Appends a bounded JSON line to the ignored local diagnostics directory. */
export function appendRuntimeProbe(
    event: string,
    details: Record<string, unknown> = {},
    playerId?: number,
): void {
    try {
        fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
        trimLogIfNeeded();
        const record = {
            at: new Date().toISOString(),
            event: String(event).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, MAX_EVENT_LENGTH),
            ...(typeof playerId === "number" ? { playerId } : {}),
            details: sanitize(details),
        };
        fs.appendFileSync(LOG_PATH, `${JSON.stringify(record)}\n`, "utf8");
    } catch {
        // A local diagnostics file must never make the game server fail.
    }
}
