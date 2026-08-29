import assert from "node:assert/strict";

import {
    decodeGroundItemMapId,
    getGroundItemMapId,
} from "@client/engine/rendering/ground/GroundItemMapKey";
import { NpcEcs } from "@client/engine/game/ecs/NpcEcs";
import { resolveNpcOwnerPlacement } from "@client/engine/rendering/npc/NpcOwnerPlacement";

const instanceMapX = 44;
const instanceMapY = 83;
const instanceMapId = (instanceMapX << 8) + instanceMapY;
const placement = resolveNpcOwnerPlacement(
    instanceMapId,
    instanceMapX,
    instanceMapY,
    2816,
    5304,
    56,
    54,
    4,
    4000,
);

assert.equal(placement.usesOverlayWorldView, false);
assert.deepEqual(
    { mapX: placement.mapX, mapY: placement.mapY, tileX: placement.tileX, tileY: placement.tileY },
    { mapX: 44, mapY: 83, tileX: 56, tileY: 46 },
);
assert.equal(placement.mapX * 64 + placement.tileX, 2872);
assert.equal(placement.mapY * 64 + placement.tileY, 5358);

const groundMapId = getGroundItemMapId(2872, 5358);
assert.equal(groundMapId, instanceMapId);
assert.deepEqual(decodeGroundItemMapId(groundMapId), { mapX: 44, mapY: 83 });

// Graardor and many other bosses are larger than one tile. Their fine
// coordinate is the centre of the footprint, while interaction occupancy is
// anchored to its south-west tile. An initial server snap must not add the
// centre offset a second time.
const npcEcs = new NpcEcs(4);
const bossSize = 2;
const bossLocalTileX = 56;
const bossLocalTileY = 46;
const boss = npcEcs.createNpc(
    instanceMapX,
    instanceMapY,
    2215,
    bossSize,
    bossLocalTileX * 128 + bossSize * 64,
    bossLocalTileY * 128 + bossSize * 64,
    2,
    0,
    bossLocalTileX,
    bossLocalTileY,
);
npcEcs.setXY(
    boss,
    bossLocalTileX * 128 + bossSize * 64,
    bossLocalTileY * 128 + bossSize * 64,
);
assert.deepEqual(
    { x: npcEcs.getOccTileX(boss), y: npcEcs.getOccTileY(boss) },
    { x: bossLocalTileX, y: bossLocalTileY },
    "a size-2 NPC's initial visual snap and interaction tile stay synchronized",
);
assert.deepEqual(
    {
        x: (npcEcs.getWorldX(boss) - bossSize * 64) >> 7,
        y: (npcEcs.getWorldY(boss) - bossSize * 64) >> 7,
    },
    { x: 2872, y: 5358 },
    "the rendered model centre resolves back to the authoritative south-west tile",
);

npcEcs.setServerMapping(boss, 1001);
npcEcs.enqueueStep(
    boss,
    (bossLocalTileX + 1) * 128 + bossSize * 64,
    bossLocalTileY * 128 + bossSize * 64,
    4,
);
npcEcs.updateClient(64);
assert.deepEqual(
    { x: npcEcs.getOccTileX(boss), y: npcEcs.getOccTileY(boss) },
    { x: bossLocalTileX + 1, y: bossLocalTileY },
    "size-aware occupancy follows an interpolated one-tile movement exactly",
);

const boundaryNpc = npcEcs.createNpc(
    instanceMapX,
    instanceMapY,
    2215,
    bossSize,
    63 * 128 + bossSize * 64,
    bossLocalTileY * 128 + bossSize * 64,
    2,
    0,
    63,
    bossLocalTileY,
);
npcEcs.setServerMapping(boundaryNpc, 1002);
npcEcs.enqueueStep(
    boundaryNpc,
    64 * 128 + bossSize * 64,
    bossLocalTileY * 128 + bossSize * 64,
    4,
);
npcEcs.updateClient(64);
const worldFineXBeforeRebase = npcEcs.getWorldX(boundaryNpc);
npcEcs.rebaseToMapSquare(boundaryNpc, instanceMapX + 1, instanceMapY);
assert.equal(npcEcs.getWorldX(boundaryNpc), worldFineXBeforeRebase);
assert.deepEqual(
    {
        mapX: npcEcs.getMapX(boundaryNpc),
        x: npcEcs.getOccTileX(boundaryNpc),
        y: npcEcs.getOccTileY(boundaryNpc),
    },
    { mapX: instanceMapX + 1, x: 0, y: bossLocalTileY },
    "map-square rebasing preserves world placement and the footprint anchor",
);

console.log("instance render coordinate tests passed");
