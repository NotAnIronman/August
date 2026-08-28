import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOCK_RECORD_VERSION = 1;

export type CacheLockOptions = Readonly<{
    lockPath: string;
    staleMs: number;
    heartbeatMs?: number;
    now?: () => number;
}>;

type CacheLockRecord = Readonly<{
    version: typeof LOCK_RECORD_VERSION;
    token: string;
    pid: number;
    hostname: string;
    createdAt: number;
}>;

type CacheLockSnapshot = Readonly<{
    contents: string;
    mtimeMs: number;
    ino: number;
    record?: CacheLockRecord;
}>;

export type CacheLockOwnership = {
    readonly lockPath: string;
    readonly token: string;
    readonly pid: number;
    readonly staleMs: number;
    readonly heartbeatMs: number;
    heartbeatTimer?: NodeJS.Timeout;
    lostReason?: string;
};

function parseLockRecord(contents: string): CacheLockRecord | undefined {
    try {
        const value: unknown = JSON.parse(contents);
        if (!value || typeof value !== "object") return undefined;

        const record = value as Partial<CacheLockRecord>;
        if (
            record.version !== LOCK_RECORD_VERSION ||
            typeof record.token !== "string" ||
            record.token.length === 0 ||
            !Number.isInteger(record.pid) ||
            typeof record.hostname !== "string" ||
            !Number.isFinite(record.createdAt)
        ) {
            return undefined;
        }

        return record as CacheLockRecord;
    } catch {
        // PID-only files from older versions remain valid locks. They can be
        // reclaimed by age, but can never be mistaken for this process's lock.
        return undefined;
    }
}

function readLockSnapshot(lockPath: string): CacheLockSnapshot | undefined {
    let descriptor: number | undefined;
    try {
        descriptor = fs.openSync(lockPath, "r");
        const stat = fs.fstatSync(descriptor);
        const contents = fs.readFileSync(descriptor, "utf8");
        return {
            contents,
            mtimeMs: stat.mtimeMs,
            ino: stat.ino,
            record: parseLockRecord(contents),
        };
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return undefined;
        throw error;
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

function sameSnapshot(left: CacheLockSnapshot, right: CacheLockSnapshot): boolean {
    return (
        left.ino === right.ino &&
        left.mtimeMs === right.mtimeMs &&
        left.contents === right.contents
    );
}

function isStale(snapshot: CacheLockSnapshot, now: number, staleMs: number): boolean {
    return now - snapshot.mtimeMs > staleMs;
}

function ownsSnapshot(ownership: CacheLockOwnership, snapshot?: CacheLockSnapshot): boolean {
    return (
        snapshot?.record?.token === ownership.token && snapshot.record.pid === ownership.pid
    );
}

function quarantinePath(lockPath: string, purpose: "stale" | "release"): string {
    return `${lockPath}.${purpose}-${process.pid}-${randomUUID()}`;
}

/**
 * Move the exact lock snapshot out of the well-known path before deleting it.
 * A contender can create a new lock after the rename, but this process will
 * only ever unlink the quarantined file and therefore cannot delete the new
 * owner's lock.
 */
function quarantineSnapshot(
    lockPath: string,
    expected: CacheLockSnapshot,
    purpose: "stale" | "release",
): string | undefined {
    const current = readLockSnapshot(lockPath);
    if (!current || !sameSnapshot(expected, current)) return undefined;

    const quarantine = quarantinePath(lockPath, purpose);
    try {
        fs.renameSync(lockPath, quarantine);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EEXIST") return undefined;
        throw error;
    }

    const moved = readLockSnapshot(quarantine);
    if (moved && sameSnapshot(expected, moved)) return quarantine;

    // The path changed between verification and rename. Never delete a file
    // whose ownership was not established; leave it quarantined for diagnosis.
    return undefined;
}

export function tryAcquireCacheLock(options: CacheLockOptions): CacheLockOwnership | undefined {
    fs.mkdirSync(path.dirname(options.lockPath), { recursive: true });

    const token = randomUUID();
    const now = options.now?.() ?? Date.now();
    const record: CacheLockRecord = {
        version: LOCK_RECORD_VERSION,
        token,
        pid: process.pid,
        hostname: os.hostname(),
        createdAt: now,
    };

    try {
        fs.writeFileSync(options.lockPath, JSON.stringify(record), { flag: "wx", encoding: "utf8" });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return undefined;
        throw error;
    }

    return {
        lockPath: options.lockPath,
        token,
        pid: process.pid,
        staleMs: options.staleMs,
        heartbeatMs: options.heartbeatMs ?? Math.max(1_000, Math.min(30_000, Math.floor(options.staleMs / 3))),
    };
}

/** Refresh the lock mtime only while the token at the lock path is ours. */
export function heartbeatCacheLock(ownership: CacheLockOwnership): boolean {
    if (ownership.lostReason) return false;

    try {
        const snapshot = readLockSnapshot(ownership.lockPath);
        if (!ownsSnapshot(ownership, snapshot)) {
            ownership.lostReason = "the lock path no longer contains this process's ownership token";
            return false;
        }

        const heartbeatTime = new Date();
        fs.utimesSync(ownership.lockPath, heartbeatTime, heartbeatTime);
        if (!ownsSnapshot(ownership, readLockSnapshot(ownership.lockPath))) {
            ownership.lostReason = "lock ownership changed during the heartbeat";
            return false;
        }
        return true;
    } catch (error) {
        ownership.lostReason = `the lock heartbeat failed: ${String(error)}`;
        return false;
    }
}

export function startCacheLockHeartbeat(ownership: CacheLockOwnership): void {
    if (ownership.heartbeatTimer) return;

    ownership.heartbeatTimer = setInterval(() => {
        heartbeatCacheLock(ownership);
    }, ownership.heartbeatMs);
    ownership.heartbeatTimer.unref();
}

export function assertCacheLockOwned(ownership: CacheLockOwnership): void {
    if (ownership.lostReason || !ownsSnapshot(ownership, readLockSnapshot(ownership.lockPath))) {
        ownership.lostReason ??= "the lock path no longer contains this process's ownership token";
        throw new Error(`Cache download lock lost: ${ownership.lostReason}`);
    }
}

/**
 * Reclaim an abandoned lock only when two reads agree on both its ownership
 * token/content and age. The exact file is then atomically quarantined before
 * deletion so a replacement owner cannot be unlinked by this process.
 */
export function reclaimStaleCacheLock(options: CacheLockOptions): boolean {
    const initial = readLockSnapshot(options.lockPath);
    if (!initial) return false;

    const now = options.now?.() ?? Date.now();
    if (!isStale(initial, now, options.staleMs)) return false;

    const confirmed = readLockSnapshot(options.lockPath);
    if (!confirmed || !sameSnapshot(initial, confirmed) || !isStale(confirmed, now, options.staleMs)) {
        return false;
    }

    const quarantine = quarantineSnapshot(options.lockPath, confirmed, "stale");
    if (!quarantine) return false;

    fs.rmSync(quarantine, { force: true });
    return true;
}

/** Stop heartbeats and remove the lock only if its ownership token is ours. */
export function releaseCacheLock(ownership: CacheLockOwnership): boolean {
    if (ownership.heartbeatTimer) {
        clearInterval(ownership.heartbeatTimer);
        ownership.heartbeatTimer = undefined;
    }

    try {
        const snapshot = readLockSnapshot(ownership.lockPath);
        if (!snapshot || !ownsSnapshot(ownership, snapshot)) return false;

        const quarantine = quarantineSnapshot(ownership.lockPath, snapshot, "release");
        if (!quarantine) return false;

        fs.rmSync(quarantine, { force: true });
        return true;
    } catch (error) {
        ownership.lostReason = `lock cleanup failed: ${String(error)}`;
        return false;
    }
}
