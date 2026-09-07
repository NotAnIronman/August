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
    const run = {version:1 as const,id:"theatre-persistence-test",access:"party" as const,roster:["alice","bob"],
        roomIndex:3,completedRooms:3,started:true,instanceId:"instance-5"};
    persistence.theatreRuns.save(run);
    assert.deepEqual(persistence.theatreRuns.load(run.id),run);
    const reopened = new PlayerPersistence({dataDir});
    assert.deepEqual(reopened.theatreRuns.load(run.id),run,"party progress survives a new persistence instance");
    assert.equal(reopened.theatreRuns.load("missing-run"),undefined);
    assert.throws(()=>reopened.theatreRuns.save({...run,completedRooms:99}),/Invalid Theatre/);

    const completed={...run,roomIndex:5,completedRooms:6,rewards:[
        {unique:true,claimed:false,items:[{itemId:22477,quantity:1}],pet:false},
        {unique:false,claimed:false,items:[{itemId:565,quantity:1500}],pet:false},
    ]};
    persistence.theatreRuns.save(completed);
    assert.equal(reopened.theatreRuns.pending!("alice")[0].id,completed.id,"recovery does not require an active player checkpoint");
    assert.equal(reopened.theatreRuns.pending!("not-in-party").length,0);
    const claiming=structuredClone(completed);claiming.rewards[0].claimed=true;
    const claimant={__saveKey:"alice",exportPersistentVars:()=>({inventory:[{itemId:22477,quantity:1}]})} as PlayerState;
    const badClaimant={__saveKey:"alice",exportPersistentVars:()=>{throw new Error("snapshot failure");}} as unknown as PlayerState;
    assert.throws(()=>persistence.theatreRuns.claim!(claiming,badClaimant),/snapshot failure/);
    assert.equal(persistence.theatreRuns.load(run.id)!.rewards![0].claimed,false,"failed player write rolls back the claimed flag");
    assert.equal(persistence.hasKey("alice"),false);
    persistence.theatreRuns.claim!(claiming,claimant);
    assert.equal(reopened.theatreRuns.load(run.id)!.rewards![0].claimed,true);
    assert.equal(reopened.theatreRuns.pending!("alice").length,0,"fully claimed loot is excluded from recovery");
    assert.equal(persistence.hasKey("alice"),true,"inventory and flag committed atomically");
    assert.throws(()=>persistence.theatreRuns.claim!(claiming,claimant),/already claimed/);
    const bobClaim=structuredClone(completed);bobClaim.rewards[1].claimed=true;
    persistence.theatreRuns.claim!(bobClaim,{__saveKey:"bob",exportPersistentVars:()=>({inventory:[{itemId:565,quantity:1500}]})} as PlayerState);
    assert(persistence.theatreRuns.load(run.id)!.rewards!.every(r=>r.claimed),"a teammate claim cannot overwrite another claim with stale data");
    const partialRun={...structuredClone(completed),id:"partial-theatre"};
    persistence.theatreRuns.save(partialRun);
    const expected=structuredClone(partialRun.rewards[1]);
    const partial=persistence.theatreRuns.load(partialRun.id)!;
    partial.rewards![1].received=[500];
    const bob={__saveKey:"bob",exportPersistentVars:()=>({bank:[{itemId:565,quantity:500}]})} as PlayerState;
    persistence.theatreRuns.claim!(partial,bob,expected);
    assert.deepEqual(reopened.theatreRuns.load(partialRun.id)!.rewards![1].received,[500]);
    assert.throws(()=>persistence.theatreRuns.claim!(partial,bob,expected),/Stale/);
    const final=persistence.theatreRuns.load(partialRun.id)!;
    const before=structuredClone(final.rewards![1]);
    final.rewards![1].received=[1500];final.rewards![1].claimed=true;
    persistence.theatreRuns.claim!(final,bob,before);
    assert(reopened.theatreRuns.load(partialRun.id)!.rewards![1].claimed);

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
