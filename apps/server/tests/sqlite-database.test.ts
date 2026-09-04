import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
    MAX_PLAYER_STATE_JSON_BYTES,
    SqliteDatabase,
    closeAllSqliteDatabases,
    getSqliteDatabase,
} from "@server/game/state/SqliteDatabase";

function makeTempDir(label: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), `august-sqlite-${label}-`));
}

function removeTempDir(directory: string): void {
    fs.rmSync(directory, { recursive: true, force: true });
}

function readUserVersion(database: DatabaseSync): number {
    const row = database.prepare("PRAGMA user_version").get() as { user_version: number };
    return Number(row.user_version);
}

{
    const dataDir = makeTempDir("memory");
    const otherDataDir = makeTempDir("memory-other");
    try {
        const first = getSqliteDatabase({ dataDir, databasePath: ":memory:" });
        const second = getSqliteDatabase({ dataDir, databasePath: ":memory:" });
        const unrelated = getSqliteDatabase({ dataDir: otherDataDir, databasePath: ":memory:" });

        assert.equal(first.databasePath, ":memory:");
        assert.strictEqual(second, first, "one data directory must share its in-memory database");
        assert.notStrictEqual(
            unrelated,
            first,
            "unrelated data directories must not accidentally share an in-memory database",
        );
        assert.equal(
            first.connection
                .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'accounts'")
                .get() !== undefined,
            true,
        );
        assert.equal(readUserVersion(first.connection), 1);
    } finally {
        closeAllSqliteDatabases();
        removeTempDir(dataDir);
        removeTempDir(otherDataDir);
    }
}

{
    const rootDir = makeTempDir("canonical-path");
    const realDir = path.join(rootDir, "real");
    const aliasDir = path.join(rootDir, "alias");
    fs.mkdirSync(realDir);
    try {
        fs.symlinkSync(realDir, aliasDir, process.platform === "win32" ? "junction" : "dir");
        const databasePath = path.join(realDir, "shared.sqlite");
        const aliasPath = path.join(aliasDir, "shared.sqlite");
        const first = getSqliteDatabase({ dataDir: realDir, databasePath });
        const throughAlias = getSqliteDatabase({ dataDir: aliasDir, databasePath: aliasPath });

        assert.strictEqual(
            throughAlias,
            first,
            "filesystem aliases must not open competing connections to one SQLite file",
        );

        first.close();
        const reopened = getSqliteDatabase({ dataDir: realDir, databasePath });
        assert.notStrictEqual(reopened, first, "a closed registry entry must be reopened");
        assert.equal(reopened.connection.isOpen, true);
    } finally {
        closeAllSqliteDatabases();
        removeTempDir(rootDir);
    }
}

{
    const dataDir = makeTempDir("future-version");
    const databasePath = path.join(dataDir, "game.sqlite");
    const raw = new DatabaseSync(databasePath);
    raw.exec("CREATE TABLE future_only (id INTEGER PRIMARY KEY); PRAGMA user_version = 2;");
    raw.close();

    try {
        assert.throws(
            () => new SqliteDatabase({ dataDir }),
            /uses newer schema version 2/,
            "an older server must not mutate or downgrade a newer database",
        );

        const renamedPath = path.join(dataDir, "future-renamed.sqlite");
        fs.renameSync(databasePath, renamedPath);
        fs.renameSync(renamedPath, databasePath);

        const verification = new DatabaseSync(databasePath);
        try {
            assert.equal(readUserVersion(verification), 2);
            assert.equal(
                verification
                    .prepare(
                        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'future_only'",
                    )
                    .get() !== undefined,
                true,
            );
            assert.equal(
                verification
                    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'accounts'")
                    .get(),
                undefined,
                "schema creation must not run before the compatibility check",
            );
        } finally {
            verification.close();
        }
    } finally {
        removeTempDir(dataDir);
    }
}

{
    const dataDir = makeTempDir("migration-rollback");
    const databasePath = path.join(dataDir, "game.sqlite");
    let database = new SqliteDatabase({ dataDir });
    database.close();
    fs.writeFileSync(
        path.join(dataDir, "accounts.json"),
        JSON.stringify({
            version: 1,
            accounts: {
                Alice: {
                    passwordAlgorithm: "scrypt",
                    passwordSalt: "salt",
                    passwordHash: "hash",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    passwordChangedAt: "2026-01-01T00:00:00.000Z",
                },
            },
        }),
    );

    const blocker = new DatabaseSync(databasePath);
    blocker.exec(`
        CREATE TRIGGER fail_legacy_account_marker
        BEFORE INSERT ON schema_migrations
        WHEN NEW.migration_id = 'legacy-accounts-json-v1'
        BEGIN
            SELECT RAISE(ABORT, 'blocked legacy migration marker');
        END;
    `);
    blocker.close();

    try {
        assert.throws(
            () => new SqliteDatabase({ dataDir }),
            /blocked legacy migration marker/,
        );

        const renamedPath = path.join(dataDir, "migration-renamed.sqlite");
        fs.renameSync(databasePath, renamedPath);
        fs.renameSync(renamedPath, databasePath);

        const verification = new DatabaseSync(databasePath);
        try {
            assert.equal(
                verification.prepare("SELECT 1 FROM accounts WHERE username = ?").get("alice"),
                undefined,
                "a failed migration marker must roll back the imported account",
            );
            verification.exec("DROP TRIGGER fail_legacy_account_marker");
        } finally {
            verification.close();
        }

        database = new SqliteDatabase({ dataDir });
        assert.equal(
            database.connection
                .prepare("SELECT 1 FROM accounts WHERE username = ?")
                .get("alice") !== undefined,
            true,
            "the migration must remain retryable after rollback",
        );
    } finally {
        if (database.connection.isOpen) database.close();
        removeTempDir(dataDir);
    }
}

{
    const dataDir = makeTempDir("state-limit");
    const database = new SqliteDatabase({ dataDir });
    try {
        const insertState = database.connection.prepare(
            "INSERT INTO player_states (account_name, state_json, updated_at) VALUES (?, ?, ?)",
        );
        insertState.run("alice", '{"bank":[]}', "2026-01-01T00:00:00.000Z");

        assert.throws(
            () =>
                database.connection
                    .prepare(
                        `INSERT INTO player_states (account_name, state_json, updated_at)
                         VALUES (?, zeroblob(?), ?)`,
                    )
                    .run(
                        "oversized",
                        MAX_PLAYER_STATE_JSON_BYTES + 1,
                        "2026-01-01T00:00:00.000Z",
                    ),
            /player state exceeds 64 MiB limit/,
        );

        database.connection.exec("BEGIN IMMEDIATE");
        database.connection
            .prepare(
                `INSERT INTO pending_trade_refunds (account_name, item_id, quantity, created_at)
                 VALUES (?, ?, ?, ?)`,
            )
            .run("alice", 4151, 1, "2026-01-01T00:00:00.000Z");
        assert.throws(
            () =>
                database.connection
                    .prepare(
                        "UPDATE player_states SET state_json = zeroblob(?) WHERE account_name = ?",
                    )
                    .run(MAX_PLAYER_STATE_JSON_BYTES + 1, "alice"),
            /player state exceeds 64 MiB limit/,
        );
        database.connection.exec("ROLLBACK");

        const state = database.connection
            .prepare("SELECT state_json AS stateJson FROM player_states WHERE account_name = ?")
            .get("alice") as { stateJson: string };
        const refundCount = database.connection
            .prepare("SELECT COUNT(*) AS count FROM pending_trade_refunds")
            .get() as { count: number };
        assert.equal(state.stateJson, '{"bank":[]}');
        assert.equal(
            Number(refundCount.count),
            0,
            "callers can roll back earlier ledger changes after an oversized save is rejected",
        );

        const plan = database.connection
            .prepare("EXPLAIN QUERY PLAN SELECT owner_key FROM social_friends WHERE friend_key = ?")
            .get("alice") as { detail: string };
        assert.match(plan.detail, /idx_social_friends_friend_key/);

        const pendingRefundPlan = database.connection
            .prepare(
                `EXPLAIN QUERY PLAN
                 SELECT id FROM pending_trade_refunds
                 WHERE account_name = ? ORDER BY id ASC`,
            )
            .get("alice") as { detail: string };
        assert.match(pendingRefundPlan.detail, /idx_pending_trade_refunds_account/);

        const activeEscrowPlan = database.connection
            .prepare(
                `EXPLAIN QUERY PLAN
                 SELECT item_id FROM active_trade_escrows WHERE account_name = ?`,
            )
            .get("alice") as { detail: string };
        assert.match(activeEscrowPlan.detail, /idx_active_trade_escrows_account/);
    } finally {
        database.close();
        removeTempDir(dataDir);
    }
}

console.log("sqlite database regression test passed");
