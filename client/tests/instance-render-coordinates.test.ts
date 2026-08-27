import assert from "node:assert/strict";

import {
    decodeGroundItemMapId,
    getGroundItemMapId,
} from "../render/ground/GroundItemMapKey";
import { resolveNpcOwnerPlacement } from "../render/npc/NpcOwnerPlacement";

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

console.log("instance render coordinate tests passed");
