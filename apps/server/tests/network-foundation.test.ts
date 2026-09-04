import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { WebSocket } from "ws";

import { closeAllSqliteDatabases, getSqliteDatabase } from "@server/game/state/SqliteDatabase";
import { AccountStore } from "@server/network/AccountStore";
import { isLocalHostingRequest } from "@server/network/HostingPortal";
import { PlayerNetworkLayer } from "@server/network/PlayerNetworkLayer";
import { resolvePublicGameEndpoint } from "@server/network/PublicGameEndpoint";
import { resolveClientAddress } from "@server/network/TrustedProxyClientAddress";

async function main(): Promise<void> {
    const direct = resolvePublicGameEndpoint(43_594, "localhost:43594", {});
    assert.deepEqual(direct, {
        address: "localhost:43594",
        secure: false,
        explicitlyConfigured: false,
    });

    const reverseProxy = resolvePublicGameEndpoint(43_594, undefined, {
        PUBLIC_WS_URL: "wss://play.example.com",
    });
    assert.deepEqual(reverseProxy, {
        address: "play.example.com:443",
        secure: true,
        explicitlyConfigured: true,
    });
    assert.deepEqual(
        resolvePublicGameEndpoint(43_594, undefined, {
            PUBLIC_HOST: "play.example.com",
            PUBLIC_PORT: "8443",
            PUBLIC_SECURE: "true",
        }),
        { address: "play.example.com:8443", secure: true, explicitlyConfigured: true },
    );

    assert.equal(isLocalHostingRequest("127.0.0.1"), true);
    assert.equal(
        isLocalHostingRequest("127.0.0.1", { "x-forwarded-for": "203.0.113.8" }),
        false,
    );
    assert.equal(isLocalHostingRequest("10.0.0.5"), false);
    assert.equal(
        resolveClientAddress("127.0.0.1", { "x-forwarded-for": "203.0.113.8" }, {}),
        "127.0.0.1",
    );
    assert.equal(
        resolveClientAddress(
            "127.0.0.1",
            { "x-forwarded-for": "203.0.113.8, 127.0.0.1" },
            { TRUST_PROXY: "true" },
        ),
        "203.0.113.8",
    );
    // Forwarding headers from a non-loopback peer are never trusted.
    assert.equal(
        resolveClientAddress(
            "198.51.100.4",
            { "x-forwarded-for": "203.0.113.8" },
            { TRUST_PROXY: "true" },
        ),
        "198.51.100.4",
    );

    const sent: Uint8Array[] = [];
    let closeCode: number | undefined;
    const fakeSocket = {
        readyState: WebSocket.OPEN,
        bufferedAmount: 0,
        send: (message: Uint8Array) => sent.push(message),
        close: (code: number) => {
            closeCode = code;
        },
        terminate: () => undefined,
    } as unknown as WebSocket;
    const network = new PlayerNetworkLayer({ outboundHighWaterBytes: 64 * 1024 });
    network.setBroadcastPhase(true);
    network.sendWithGuard(fakeSocket, new Uint8Array(32), "test");
    network.flushMessageBatch(fakeSocket);
    assert.equal(sent.length, 1);
    Object.defineProperty(fakeSocket, "bufferedAmount", { value: 64 * 1024 });
    network.sendWithGuard(fakeSocket, new Uint8Array(1), "slow_test");
    assert.equal(closeCode, 1013);

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "august-network-foundation-"));
    try {
        const store = new AccountStore({ dataDir });
        const created = store.authenticateAsync("AsyncUser", "hunter123", true);
        assert.equal(typeof created.then, "function");
        assert.deepEqual(await created, {
            ok: true,
            created: true,
            accountName: "asyncuser",
        });
        assert.deepEqual(await store.authenticateAsync("ASYNCUSER", "hunter123", false), {
            ok: true,
            created: false,
            accountName: "asyncuser",
        });
        assert.deepEqual(await store.authenticateAsync("asyncuser", "incorrect", false), {
            ok: false,
        });

        const databasePath = getSqliteDatabase({ dataDir }).databasePath;
        closeAllSqliteDatabases();
        assert.equal(fs.existsSync(databasePath), true);
        // Clearing the registry permits a clean in-process restart on the same file.
        assert.equal(
            getSqliteDatabase({ dataDir })
                .connection.prepare("SELECT 1 FROM accounts WHERE username = ?")
                .get("asyncuser") !== undefined,
            true,
        );
    } finally {
        // Assertions can fail while SQLite still owns native file handles. A
        // failure-safe cleanup keeps reruns deterministic, especially on Windows.
        try {
            closeAllSqliteDatabases();
        } finally {
            fs.rmSync(dataDir, { recursive: true, force: true });
        }
    }

    console.log("network foundation regression test passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
