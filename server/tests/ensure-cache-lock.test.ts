/**
 * Focused regression coverage for the cache download lock.
 *
 * Run with: npx tsx tests/ensure-cache-lock.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    assertCacheLockOwned,
    heartbeatCacheLock,
    reclaimStaleCacheLock,
    releaseCacheLock,
    startCacheLockHeartbeat,
    tryAcquireCacheLock,
} from "../scripts/ensure-cache-lock";

async function run(): Promise<void> {
    const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "xrsps-cache-lock-test-"));
    const lockPath = path.join(testDirectory, ".cache-download.lock");
    const options = { lockPath, staleMs: 1_000, heartbeatMs: 10 } as const;

    try {
        const firstOwner = tryAcquireCacheLock(options);
        assert.ok(firstOwner, "the first process should acquire an absent lock");
        assert.equal(tryAcquireCacheLock(options), undefined, "a held lock must exclude contenders");
        assert.equal(heartbeatCacheLock(firstOwner), true);

        const firstToken = firstOwner.token;
        assert.equal(releaseCacheLock(firstOwner), true);
        assert.equal(fs.existsSync(lockPath), false);

        const secondOwner = tryAcquireCacheLock(options);
        assert.ok(secondOwner);
        assert.notEqual(secondOwner.token, firstToken, "each acquisition needs a unique owner token");

        const replacementRecord = JSON.parse(fs.readFileSync(lockPath, "utf8")) as {
            token: string;
        };
        replacementRecord.token = "replacement-owner-token";
        fs.writeFileSync(lockPath, JSON.stringify(replacementRecord), "utf8");

        assert.throws(
            () => assertCacheLockOwned(secondOwner),
            /Cache download lock lost/,
            "a displaced owner must stop before publishing its staged cache",
        );
        assert.equal(
            releaseCacheLock(secondOwner),
            false,
            "an old owner must not remove a replacement owner's lock",
        );
        assert.equal(fs.existsSync(lockPath), true);

        fs.rmSync(lockPath, { force: true });
        const heartbeatOwner = tryAcquireCacheLock(options);
        assert.ok(heartbeatOwner);
        const oldTime = new Date(Date.now() - 10_000);
        fs.utimesSync(lockPath, oldTime, oldTime);
        assert.equal(heartbeatCacheLock(heartbeatOwner), true);
        assert.equal(
            reclaimStaleCacheLock(options),
            false,
            "a current heartbeat must prevent stale-lock reclamation",
        );

        const mtimeBeforeTimer = fs.statSync(lockPath).mtimeMs;
        startCacheLockHeartbeat(heartbeatOwner);
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.ok(
            fs.statSync(lockPath).mtimeMs > mtimeBeforeTimer,
            "the owner heartbeat should periodically refresh the lock mtime",
        );
        assert.equal(releaseCacheLock(heartbeatOwner), true);

        const abandonedOwner = tryAcquireCacheLock(options);
        assert.ok(abandonedOwner);
        fs.utimesSync(lockPath, oldTime, oldTime);
        assert.equal(reclaimStaleCacheLock(options), true);
        assert.equal(fs.existsSync(lockPath), false);
        assert.equal(
            releaseCacheLock(abandonedOwner),
            false,
            "a reclaimed owner must not clean up a later lock",
        );

        // Locks written by the previous PID-only implementation remain
        // recoverable once stale, without ever being treated as token-owned.
        fs.writeFileSync(lockPath, "12345", { flag: "wx" });
        fs.utimesSync(lockPath, oldTime, oldTime);
        assert.equal(reclaimStaleCacheLock(options), true);
        assert.equal(fs.existsSync(lockPath), false);
    } finally {
        fs.rmSync(testDirectory, { recursive: true, force: true });
    }

    console.log("ensure-cache lock regression test passed");
}

run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
