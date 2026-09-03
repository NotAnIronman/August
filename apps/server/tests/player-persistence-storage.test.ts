import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { PlayerPersistentVars, PlayerState } from "@server/game/player";
import { PlayerPersistence } from "@server/game/state/PlayerPersistence";
import {
    MAX_PLAYER_STATE_JSON_BYTES,
    closeAllSqliteDatabases,
    getSqliteDatabase,
} from "@server/game/state/SqliteDatabase";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "august-player-persistence-"));

try {
    const persistence = new PlayerPersistence({ dataDir });
    const database = getSqliteDatabase({ dataDir });
    const connection = database.connection;

    const savedState: PlayerPersistentVars = {
        accountStage: 2,
        runEnergy: 7_500,
    };
    const sourcePlayer = {
        exportPersistentVars: () => savedState,
    } as PlayerState;
    let appliedState: PlayerPersistentVars | undefined;
    const targetPlayer = {
        applyPersistentVars: (state: PlayerPersistentVars | undefined) => {
            appliedState = state;
        },
    } as PlayerState;

    // If persistence methods try to compile SQL after construction, this
    // replacement makes the regression deterministic instead of timing-based.
    const originalPrepare = connection.prepare.bind(connection);
    (connection as unknown as { prepare: DatabaseSync["prepare"] }).prepare = () => {
        throw new Error("PlayerPersistence prepared SQL after construction");
    };
    try {
        persistence.saveSnapshot("valid", sourcePlayer);
        assert.equal(persistence.hasKey("valid"), true);
        persistence.applyToPlayer(targetPlayer, "valid");
    } finally {
        (connection as unknown as { prepare: DatabaseSync["prepare"] }).prepare = originalPrepare;
    }
    assert.deepEqual(appliedState, savedState);

    const insertRawState = originalPrepare(
        `INSERT INTO player_states (account_name, state_json, updated_at)
         VALUES (?, ?, ?)`,
    );
    insertRawState.run("malformed", '{"bank":', "2026-01-01T00:00:00.000Z");

    // Simulate a database created or modified before the current size trigger.
    // Build the payload inside SQLite so the test itself never allocates a
    // second 64 MiB JavaScript string merely to insert it.
    connection.exec(`
        DROP TRIGGER validate_player_state_size_insert;
        DROP TRIGGER validate_player_state_size_update;
    `);
    const insertOversizedState = originalPrepare(
        `INSERT INTO player_states (account_name, state_json, updated_at)
         VALUES (
             ?,
             '{"gamemodeData":{"payload":"' || printf('%.*c', ?, 'x') || '"}}',
             ?
         )`,
    );
    insertOversizedState.run(
        "oversized",
        MAX_PLAYER_STATE_JSON_BYTES,
        "2026-01-01T00:00:00.000Z",
    );

    appliedState = savedState;
    persistence.applyToPlayer(targetPlayer, "malformed");
    assert.equal(appliedState, undefined, "malformed JSON must fall back without escaping parse");

    appliedState = savedState;
    persistence.applyToPlayer(targetPlayer, "oversized");
    assert.equal(appliedState, undefined, "oversized legacy state must not be loaded or parsed");
    assert.equal(
        persistence.hasKey("oversized"),
        true,
        "rejecting a corrupt row must not delete or quarantine account data",
    );

    const oversizedMetadata = originalPrepare(
        `SELECT typeof(state_json) AS stateType,
                length(CAST(state_json AS BLOB)) AS stateBytes
         FROM player_states WHERE account_name = ?`,
    ).get("oversized") as { stateType: string; stateBytes: number };
    assert.equal(oversizedMetadata.stateType, "text");
    assert.ok(oversizedMetadata.stateBytes > MAX_PLAYER_STATE_JSON_BYTES);
    assert.equal(
        originalPrepare("SELECT state_json FROM player_states WHERE account_name = ?").get(
            "malformed",
        ) !== undefined,
        true,
        "malformed state must be preserved for manual recovery",
    );
} finally {
    closeAllSqliteDatabases();
    fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log("player persistence storage regression test passed");
