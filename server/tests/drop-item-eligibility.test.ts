import assert from "node:assert/strict";

import { DropRollService } from "../src/game/drops/DropRollService";

const service = new DropRollService({
    get: () => ({
        always: [
            {
                itemId: 26360,
                quantity: { min: 1, max: 1 },
                dropBoostEligible: false,
            },
        ],
        pools: [],
    }),
} as never);

const baseContext = {
    npcTypeId: 2215,
    npcName: "General Graardor",
    tile: { x: 2872, y: 5358, level: 2 },
    isWilderness: false,
    recipients: [{ ownerId: 1, dropRateMultiplier: 1 }],
};

assert.equal(service.roll({ ...baseContext, canReceiveItem: () => false }).length, 0);
assert.deepEqual(service.roll({ ...baseContext, canReceiveItem: () => true }), [
    {
        itemId: 26360,
        quantity: 1,
        tile: { x: 2872, y: 5358, level: 2 },
        ownerId: 1,
        isMonsterDrop: true,
        isWilderness: false,
        worldViewId: undefined,
    },
]);

console.log("drop item eligibility tests passed");
