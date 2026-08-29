import assert from "node:assert/strict";

import { getMapIndexFromTile } from "../rs/map/MapFileIndex";
import { ClientState } from "../game/ClientState";
import { resolveNpcEcsMapSquare } from "../game/npc/NpcEcsMapSquare";

function resetClientState(): void {
    ClientState.inInstance = false;
    ClientState.regionX = -1;
    ClientState.regionY = -1;
}

// Bug #1: instanced NPCs were ECS-bucketed using plain getMapIndexFromTile(),
// which does not correspond to the one real map square an instance actually
// loads (ClientState.regionX>>3 / regionY>>3), unlike the parallel geometry-
// flush bucketing (getNpcInstanceRenderMapId) which already special-cased it.

// Outside an instance: falls back to plain per-tile map-square math,
// identical to the pre-fix behavior.
resetClientState();
{
    const worldTileX = 3200;
    const worldTileY = 3200;
    const result = resolveNpcEcsMapSquare(worldTileX, worldTileY, undefined);
    assert.deepEqual(result, {
        mapX: getMapIndexFromTile(worldTileX),
        mapY: getMapIndexFromTile(worldTileY),
    });
}

// Outside an instance even with a worldViewId present (e.g. a world-entity
// overlay, not an instanced room): still plain per-tile math.
resetClientState();
{
    const worldTileX = 3200;
    const worldTileY = 3200;
    const result = resolveNpcEcsMapSquare(worldTileX, worldTileY, 4000);
    assert.deepEqual(result, {
        mapX: getMapIndexFromTile(worldTileX),
        mapY: getMapIndexFromTile(worldTileY),
    });
}

// Inside an instance but no worldViewId known yet for this NPC: still falls
// back to plain math (matches getNpcInstanceRenderMapId's own fallback), so
// this never regresses the ambiguous-view-id case NpcInstanceFlushController
// already handles via its own safe retry/fallback logic.
resetClientState();
{
    ClientState.inInstance = true;
    ClientState.regionX = 362;
    ClientState.regionY = 700;
    const worldTileX = 2872;
    const worldTileY = 5358;
    const result = resolveNpcEcsMapSquare(worldTileX, worldTileY, undefined);
    assert.deepEqual(result, {
        mapX: getMapIndexFromTile(worldTileX),
        mapY: getMapIndexFromTile(worldTileY),
    });
}

// Inside an instance with a known worldViewId: uses the instance's real
// (and only) loaded map square, matching getNpcInstanceRenderMapId exactly -
// this is the core fix. Deliberately NOT equal to plain per-tile math, to
// prove the fix actually changes behavior for the buggy case.
resetClientState();
{
    ClientState.inInstance = true;
    ClientState.regionX = 362;
    ClientState.regionY = 700;
    const worldTileX = 2872;
    const worldTileY = 5358;
    const result = resolveNpcEcsMapSquare(worldTileX, worldTileY, 4000);
    assert.deepEqual(result, { mapX: 362 >> 3, mapY: 700 >> 3 });
    assert.notDeepEqual(result, {
        mapX: getMapIndexFromTile(worldTileX),
        mapY: getMapIndexFromTile(worldTileY),
    });
}

// A negative worldViewId (explicitly "not in a private view") must not be
// treated as instance-scoped even while ClientState.inInstance is true.
resetClientState();
{
    ClientState.inInstance = true;
    ClientState.regionX = 362;
    ClientState.regionY = 700;
    const worldTileX = 2872;
    const worldTileY = 5358;
    const result = resolveNpcEcsMapSquare(worldTileX, worldTileY, -1);
    assert.deepEqual(result, {
        mapX: getMapIndexFromTile(worldTileX),
        mapY: getMapIndexFromTile(worldTileY),
    });
}

resetClientState();
console.log("npc-ecs-map-square (bug #1) tests passed");
