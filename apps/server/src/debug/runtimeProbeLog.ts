import fs from "node:fs";
import path from "node:path";

import { serverVarPath } from "@server/paths";

const LOG_PATH = serverVarPath("logs", "runtime-probe.log");
const MAX_LOG_BYTES = 256 * 1024;
const MAX_EVENT_LENGTH = 80;
const MAX_TEXT_LENGTH = 320;
const MAX_COLLECTION_SIZE = 20;
const MAX_SANITIZED_VALUES = 256;
const MAX_BUFFERED_RECORDS = 256;
const FLUSH_DELAY_MS = 50;

const pendingRecords: string[] = [];
let flushTimer: NodeJS.Timeout | undefined;
let flushInFlight: Promise<void> | undefined;
let droppedRecords = 0;

type SanitizeBudget = { remaining: number };

function sanitize(value: unknown, depth: number, budget: SanitizeBudget): unknown {
    if (budget.remaining-- <= 0) return "[truncated]";
    if (value === null || value === undefined || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
    if (typeof value === "string") return value.slice(0, MAX_TEXT_LENGTH);
    if (depth >= 3) return "[truncated]";
    if (Array.isArray(value)) {
        return value
            .slice(0, MAX_COLLECTION_SIZE)
            .map((entry) => sanitize(entry, depth + 1, budget));
    }
    if (typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(
            0,
            MAX_COLLECTION_SIZE,
        )) {
            if (budget.remaining <= 0) {
                out.__truncated = true;
                break;
            }
            out[key.slice(0, 80)] = sanitize(entry, depth + 1, budget);
        }
        return out;
    }
    return String(value).slice(0, MAX_TEXT_LENGTH);
}

async function trimLogIfNeeded(): Promise<void> {
    try {
        const stat = await fs.promises.stat(LOG_PATH);
        if (stat.size <= MAX_LOG_BYTES) return;
        const existing = await fs.promises.readFile(LOG_PATH, "utf8");
        const retained = existing.slice(-(MAX_LOG_BYTES >> 1));
        const firstNewline = retained.indexOf("\n");
        await fs.promises.writeFile(
            LOG_PATH,
            firstNewline >= 0 ? retained.slice(firstNewline + 1) : retained,
            "utf8",
        );
    } catch {
        // This is strictly diagnostic; failed log maintenance is harmless.
    }
}

function scheduleFlush(): void {
    if (flushTimer || flushInFlight) return;
    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        void flushRuntimeProbes();
    }, FLUSH_DELAY_MS);
    // Diagnostics must never keep a test process or a shutting-down world alive.
    flushTimer.unref();
}

async function writePendingRecords(): Promise<void> {
    if (pendingRecords.length === 0) return;
    const records = pendingRecords.splice(0, pendingRecords.length);
    const dropped = droppedRecords;
    droppedRecords = 0;
    if (dropped > 0) {
        records.unshift(
            `${JSON.stringify({
                at: new Date().toISOString(),
                event: "runtime_probe_records_dropped",
                details: { count: dropped },
            })}\n`,
        );
    }

    try {
        await fs.promises.mkdir(path.dirname(LOG_PATH), { recursive: true });
        await trimLogIfNeeded();
        await fs.promises.appendFile(LOG_PATH, records.join(""), "utf8");
    } catch {
        // A local diagnostics file must never make the game server fail.
    }
}

/**
 * Flushes queued probe records without blocking the game tick. Shutdown paths
 * may await this function when retaining every final diagnostic matters.
 */
export async function flushRuntimeProbes(): Promise<void> {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
    }
    if (flushInFlight) {
        await flushInFlight;
    }
    if (pendingRecords.length === 0) return;

    flushInFlight = writePendingRecords();
    try {
        await flushInFlight;
    } finally {
        flushInFlight = undefined;
        if (pendingRecords.length > 0) scheduleFlush();
    }
}

/** Queues a bounded JSON line for the ignored local diagnostics directory. */
export function appendRuntimeProbe(
    event: string,
    details: Record<string, unknown> = {},
    playerId?: number,
): void {
    try {
        const record = {
            at: new Date().toISOString(),
            event: String(event).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, MAX_EVENT_LENGTH),
            ...(typeof playerId === "number" ? { playerId } : {}),
            details: sanitize(details, 0, { remaining: MAX_SANITIZED_VALUES }),
        };
        if (pendingRecords.length >= MAX_BUFFERED_RECORDS) {
            droppedRecords++;
            return;
        }
        pendingRecords.push(`${JSON.stringify(record)}\n`);
        scheduleFlush();
    } catch {
        // Diagnostic serialization must never make the game server fail.
    }
}
