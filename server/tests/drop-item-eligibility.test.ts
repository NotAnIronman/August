import assert from "node:assert/strict";

import { DropRollService } from "../src/game/drops/DropRollService";
import { resolveDropTable } from "../src/game/drops/helpers";

function withFixedRandom<T>(value: number, callback: () => T): T {
    const originalRandom = Math.random;
    Math.random = () => value;
    try {
        return callback();
    } finally {
        Math.random = originalRandom;
    }
}

function withRandomSequence<T>(values: readonly number[], callback: () => T): T {
    const originalRandom = Math.random;
    let index = 0;
    Math.random = () => values[Math.min(index++, values.length - 1)] ?? 0;
    try {
        return callback();
    } finally {
        Math.random = originalRandom;
    }
}

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

const pairedService = new DropRollService({
    get: () => ({
        always: [],
        pools: [
            {
                kind: "weighted",
                category: "main",
                rolls: 1,
                nothingProbability: 0,
                entries: [
                    {
                        itemId: 145,
                        quantity: { min: 3, max: 3 },
                        probability: 1,
                        dropBoostEligible: false,
                        outcomeId: "paired-potions",
                    },
                    {
                        itemId: 157,
                        quantity: { min: 3, max: 3 },
                        probability: 1,
                        dropBoostEligible: false,
                        outcomeId: "paired-potions",
                    },
                ],
            },
        ],
    }),
} as never);
assert.deepEqual(
    pairedService.roll(baseContext),
    [
        {
            itemId: 145,
            quantity: 3,
            tile: { x: 2872, y: 5358, level: 2 },
            ownerId: 1,
            isMonsterDrop: true,
            isWilderness: false,
            worldViewId: undefined,
        },
        {
            itemId: 157,
            quantity: 3,
            tile: { x: 2872, y: 5358, level: 2 },
            ownerId: 1,
            isMonsterDrop: true,
            isWilderness: false,
            worldViewId: undefined,
        },
    ],
    "one weighted outcome awards every item in its paired bundle",
);

const groupedKrilTable = resolveDropTable({
    pools: [
        {
            kind: "weighted",
            category: "main",
            rollGroupId: "wiki:exclusive:1",
            entries: [{ itemId: 1289, rarity: 0.95 }],
        },
        {
            kind: "weighted",
            category: "shared",
            rollGroupId: "wiki:exclusive:1",
            entries: [{ itemId: 1249, rarity: 0.05 }],
        },
    ],
});
assert.equal(groupedKrilTable?.pools[0]?.rollGroupId, "wiki:exclusive:1");
const groupedKrilService = new DropRollService({ get: () => groupedKrilTable } as never);
assert.deepEqual(
    withFixedRandom(0.5, () =>
        groupedKrilService.roll(baseContext).map((drop) => drop.itemId),
    ),
    [1289],
    "K'ril's ordinary branch consumes the one shared exclusive roll",
);
assert.deepEqual(
    withFixedRandom(0.97, () =>
        groupedKrilService.roll(baseContext).map((drop) => drop.itemId),
    ),
    [1249],
    "K'ril's RDT branch replaces rather than accompanies an ordinary main drop",
);

const intentionallySeparateWeightedService = new DropRollService({
    get: () => resolveDropTable({
        pools: [
            {
                kind: "weighted",
                category: "main",
                entries: [{ itemId: 3001, rarity: 1 }],
            },
            {
                kind: "weighted",
                category: "other",
                entries: [{ itemId: 3002, rarity: 1 }],
            },
        ],
    }),
} as never);
assert.deepEqual(
    intentionallySeparateWeightedService.roll(baseContext).map((drop) => drop.itemId),
    [3001, 3002],
    "ungrouped manual weighted pools remain intentionally independent",
);

const contextualService = new DropRollService({
    get: () => ({
        always: [],
        pools: [
            {
                kind: "independent",
                category: "tertiary",
                rolls: 1,
                nothingProbability: 0,
                entries: [
                    {
                        itemId: 11942,
                        quantity: { min: 1, max: 1 },
                        probability: 1,
                        condition: { wildernessGodWarsDungeonOnly: true },
                        dropBoostEligible: false,
                    },
                    {
                        itemId: 23083,
                        quantity: { min: 1, max: 1 },
                        probability: 1,
                        condition: {
                            slayerTaskOnly: true,
                            requiredSlayerMaster: "konar quo maten",
                        },
                        dropBoostEligible: false,
                    },
                ],
            },
        ],
    }),
} as never);
assert.deepEqual(contextualService.roll(baseContext), []);
assert.deepEqual(
    contextualService.roll({
        ...baseContext,
        tile: { x: 3040, y: 10140, level: 0 },
    }).map((drop) => drop.itemId),
    [11942],
    "ecumenical keys only roll inside the Wilderness God Wars Dungeon",
);
assert.deepEqual(
    contextualService.roll({
        ...baseContext,
        tile: { x: 3068, y: 10140, level: 0 },
    }),
    [],
    "the stair-stepped north-east notch is outside the Wilderness GWD drop area",
);
const konarPlayer = {
    combat: { slayerTask: { onTask: true, slayerMaster: "Konar" } },
    skillSystem: { getSlayerTaskInfo: () => ({ onTask: true }) },
    exportEquipmentSnapshot: () => [],
    varps: { getVarpValue: () => 0 },
};
assert.deepEqual(
    contextualService.roll({
        ...baseContext,
        recipients: [{ ownerId: 1, dropRateMultiplier: 1, player: konarPlayer as never }],
    }).map((drop) => drop.itemId),
    [23083],
    "Brimstone keys only roll on Konar Slayer assignments",
);
const mismatchedActiveTaskPlayer = {
    combat: {
        slayerTask: {
            active: true,
            monsterName: "Abyssal demon",
            slayerMaster: "Konar",
        },
    },
    skillSystem: { getSlayerTaskInfo: () => ({ onTask: true }) },
    exportEquipmentSnapshot: () => [],
    varps: { getVarpValue: () => 0 },
};
assert.deepEqual(
    contextualService.roll({
        ...baseContext,
        recipients: [{
            ownerId: 1,
            dropRateMultiplier: 1,
            player: mismatchedActiveTaskPlayer as never,
        }],
    }),
    [],
    "an active assignment for another species cannot grant this NPC's task-only drops",
);
const unnamedActiveTaskPlayer = {
    combat: { slayerTask: { active: true, slayerMaster: "Konar" } },
    skillSystem: { getSlayerTaskInfo: () => ({ onTask: true }) },
    exportEquipmentSnapshot: () => [],
    varps: { getVarpValue: () => 0 },
};
assert.deepEqual(
    contextualService.roll({
        ...baseContext,
        recipients: [{ ownerId: 1, dropRateMultiplier: 1, player: unnamedActiveTaskPlayer as never }],
    }),
    [],
    "generic active-task state without a target cannot grant task-only drops",
);

const wildernessLocationService = new DropRollService({
    get: () => resolveDropTable({
        always: [],
        pools: [{
            kind: "independent",
            category: "tertiary",
            entries: [
                {
                    itemId: 11941,
                    quantity: 1,
                    rarity: 1,
                    condition: { wildernessOnly: true },
                    dropBoostEligible: false,
                },
                {
                    itemId: 23490,
                    quantity: 1,
                    rarity: 1,
                    condition: { recipientWildernessOnly: true },
                    dropBoostEligible: false,
                },
            ],
        }],
    }),
} as never);
assert.deepEqual(
    wildernessLocationService.roll({
        ...baseContext,
        tile: { x: 2944, y: 3519, level: 0 },
        isWilderness: false,
        recipients: [{
            ownerId: 1,
            tile: { x: 2944, y: 3520, level: 0 },
            dropRateMultiplier: 1,
        }],
    }).map((drop) => drop.itemId),
    [23490],
    "a recipient on the Wilderness boundary can receive player-location drops even when the NPC is outside",
);
assert.deepEqual(
    wildernessLocationService.roll({
        ...baseContext,
        tile: { x: 2944, y: 3520, level: 0 },
        isWilderness: true,
        recipients: [{
            ownerId: 1,
            tile: { x: 2944, y: 3519, level: 0 },
            dropRateMultiplier: 1,
        }],
    }).map((drop) => drop.itemId),
    [11941],
    "a recipient just outside the boundary cannot receive player-location drops from an NPC inside",
);
assert.deepEqual(
    wildernessLocationService.roll({
        ...baseContext,
        tile: { x: 2944, y: 3519, level: 0 },
        isWilderness: false,
        recipients: [{
            ownerId: 1,
            tile: { x: 3040, y: 10140, level: 0 },
            dropRateMultiplier: 1,
        }],
    }).map((drop) => drop.itemId),
    [23490],
    "the recipient form of the condition includes the Wilderness God Wars Dungeon",
);
assert.deepEqual(
    wildernessLocationService.roll({
        ...baseContext,
        tile: { x: 2944, y: 3519, level: 0 },
        isWilderness: false,
        recipients: [{
            ownerId: 1,
            tile: { x: 3384, y: 10050, level: 0 },
            dropRateMultiplier: 1,
        }],
    }).map((drop) => drop.itemId),
    [23490],
    "the recipient condition includes the cache-backed Wilderness Slayer Cave regions",
);
assert.deepEqual(
    wildernessLocationService.roll({
        ...baseContext,
        tile: { x: 3199, y: 10071, level: 0 },
        isWilderness: false,
        recipients: [{
            ownerId: 1,
            tile: { x: 2944, y: 3519, level: 0 },
            dropRateMultiplier: 1,
        }],
    }).map((drop) => drop.itemId),
    [11941],
    "monster-location Wilderness drops include the cache-backed Revenant Cave regions",
);
for (const tile of [
    { x: 3327, y: 10052, level: 0 },
    { x: 3384, y: 10050, level: 1 },
]) {
    assert.deepEqual(
        wildernessLocationService.roll({
            ...baseContext,
            tile: { x: 2944, y: 3519, level: 0 },
            isWilderness: false,
            recipients: [{ ownerId: 1, tile, dropRateMultiplier: 1 }],
        }),
        [],
        "tiles outside the exact plane-0 underground Wilderness regions must fail closed",
    );
}

const alternateRateService = new DropRollService({
    get: () => ({
        always: [],
        pools: [{
            kind: "independent",
            category: "tertiary",
            rolls: 1,
            nothingProbability: 0,
            entries: [{
                itemId: 20754,
                quantity: { min: 1, max: 1 },
                probability: 0,
                altProbability: 1,
                altCondition: { wildernessOnly: true },
                dropBoostEligible: false,
            }],
        }],
    }),
} as never);
assert.equal(
    resolveDropTable({
        pools: [{
            kind: "independent",
            category: "tertiary",
            entries: [{
                itemId: 20754,
                rarity: 0,
                altRarity: 1,
                altCondition: { wildernessOnly: true },
            }],
        }],
    })?.pools[0]?.entries[0]?.altProbability,
    1,
    "the real table resolver must retain an alternate-only conditional entry",
);
assert.deepEqual(alternateRateService.roll(baseContext), []);
assert.deepEqual(
    alternateRateService.roll({ ...baseContext, isWilderness: true }).map((drop) => drop.itemId),
    [20754],
    "alternate Wilderness rates are evaluated per recipient and location",
);

const underfilledWeightedService = new DropRollService({
    get: () => resolveDropTable({
        pools: [{
            kind: "weighted",
            category: "main",
            entries: [
                {
                    itemId: 1001,
                    rarity: 0.2,
                    altRarity: 0.4,
                    altCondition: { wildernessOnly: true },
                },
                { itemId: 1002, rarity: 0.3 },
            ],
        }],
    }),
} as never);
const rollUnderfilled = (random: number, isWilderness: boolean = false): number[] =>
    withFixedRandom(random, () =>
        underfilledWeightedService
            .roll({ ...baseContext, isWilderness })
            .map((drop) => drop.itemId),
    );
assert.deepEqual(rollUnderfilled(0.49), [], "the base table retains its exact 0.5 nothing slice");
assert.deepEqual(rollUnderfilled(0.55), [1001], "the base 0.2 outcome stays literal");
assert.deepEqual(rollUnderfilled(0.8), [1002], "the unrelated base 0.3 outcome stays literal");
assert.deepEqual(
    rollUnderfilled(0.29, true),
    [],
    "the alternate table retains its exact 0.3 nothing slice",
);
assert.deepEqual(
    rollUnderfilled(0.35, true),
    [1001],
    "the active alternate probability replaces only its own base slice",
);
assert.deepEqual(
    rollUnderfilled(0.8, true),
    [1002],
    "an alternate rate cannot dilute an unrelated outcome while the table remains underfilled",
);

const overfilledWeightedService = new DropRollService({
    get: () => resolveDropTable({
        pools: [{
            kind: "weighted",
            category: "main",
            entries: [
                {
                    itemId: 2001,
                    rarity: 0.8,
                    altRarity: 0.9,
                    altCondition: { wildernessOnly: true },
                },
                { itemId: 2002, rarity: 0.8 },
            ],
        }],
    }),
} as never);
const rollOverfilled = (random: number, isWilderness: boolean = false): number[] =>
    withFixedRandom(random, () =>
        overfilledWeightedService
            .roll({ ...baseContext, isWilderness })
            .map((drop) => drop.itemId),
    );
assert.deepEqual(rollOverfilled(0.49), [2001]);
assert.deepEqual(rollOverfilled(0.51), [2002], "base weights normalize as 0.8 / 1.6");
assert.deepEqual(rollOverfilled(0.529, true), [2001]);
assert.deepEqual(
    rollOverfilled(0.53, true),
    [2002],
    "the active context normalizes raw alternate weights as 0.9 / 1.7",
);

assert.deepEqual(
    withFixedRandom(0.6, () =>
        underfilledWeightedService.roll({
            ...baseContext,
            canReceiveItem: (_npcTypeId: number, itemId: number) => itemId !== 1001,
        }),
    ),
    [],
    "an ineligible weighted outcome becomes nothing instead of redistributing its probability",
);
assert.deepEqual(
    withFixedRandom(0.8, () =>
        underfilledWeightedService
            .roll({
                ...baseContext,
                canReceiveItem: (_npcTypeId: number, itemId: number) => itemId !== 1001,
            })
            .map((drop) => drop.itemId),
    ),
    [1002],
    "eligibility does not change the surviving outcome's literal probability",
);

const gargoylePreRollService = new DropRollService({
    get: () => resolveDropTable({
        pools: [
            {
                kind: "weighted",
                category: "pre_roll",
                rollGroupId: "wiki:pre-roll:1:0",
                rollChainId: "wiki:drop-chain:1",
                rollChainOrder: 0,
                entries: [{ itemId: 4101, rarity: "1/512" }],
            },
            {
                kind: "weighted",
                category: "pre_roll",
                rollGroupId: "wiki:pre-roll:1:1",
                rollChainId: "wiki:drop-chain:1",
                rollChainOrder: 1,
                entries: [{ itemId: 4153, rarity: "1/256" }],
            },
            {
                kind: "weighted",
                category: "main",
                rollGroupId: "wiki:exclusive:1",
                rollChainId: "wiki:drop-chain:1",
                rollChainOrder: 2,
                entries: [{ itemId: 1289, rarity: 1 }],
            },
        ],
    })!,
} as never);
const rollGargoyle = (values: readonly number[]): number[] =>
    withRandomSequence(values, () =>
        gargoylePreRollService.roll(baseContext).map((drop) => drop.itemId),
    );
assert.deepEqual(
    rollGargoyle([1 - 1 / 512]),
    [4101],
    "the exact 1/512 dark-mystic stage must short-circuit every later stage",
);
assert.deepEqual(
    rollGargoyle([0, 1 - 1 / 256]),
    [4153],
    "the granite-maul 1/256 roll must run only after the dark-mystic stage misses",
);
assert.deepEqual(
    rollGargoyle([0, 0, 0.5]),
    [1289],
    "the main table must keep its full probability mass after every pre-roll misses",
);

const abyssalSirePreRollService = new DropRollService({
    get: () => resolveDropTable({
        pools: [
            {
                kind: "weighted",
                category: "pre_roll",
                rollGroupId: "wiki:pre-roll:1:0",
                rollChainId: "wiki:drop-chain:1",
                rollChainOrder: 0,
                rolls: 1,
                entries: [{ itemId: 13273, rarity: "1/100" }],
            },
            {
                kind: "weighted",
                category: "main",
                rollGroupId: "wiki:exclusive:1",
                rollChainId: "wiki:drop-chain:1",
                rollChainOrder: 1,
                rolls: 1,
                entries: [{ itemId: 1289, rarity: 1 }],
            },
        ],
    })!,
} as never);
assert.deepEqual(
    withRandomSequence([1 - 1 / 100], () =>
        abyssalSirePreRollService.roll(baseContext).map((drop) => drop.itemId),
    ),
    [13273],
    "Sire checks Unsired exactly once and a hit replaces the standard drop",
);
assert.deepEqual(
    withRandomSequence([0, 0.5], () =>
        abyssalSirePreRollService.roll(baseContext).map((drop) => drop.itemId),
    ),
    [1289],
    "a failed Sire Unsired check falls through to exactly one standard drop",
);

const multiCycleChainService = new DropRollService({
    get: () => resolveDropTable({
        pools: [
            {
                kind: "weighted",
                category: "pre_roll",
                rollGroupId: "wiki:pre-roll:2:0",
                rollChainId: "wiki:drop-chain:2",
                rollChainOrder: 0,
                rolls: 2,
                entries: [{ itemId: 13273, rarity: 0.5 }],
            },
            {
                kind: "weighted",
                category: "main",
                rollGroupId: "wiki:exclusive:2",
                rollChainId: "wiki:drop-chain:2",
                rollChainOrder: 1,
                rolls: 2,
                entries: [{ itemId: 1289, rarity: 1 }],
            },
        ],
    })!,
} as never);
assert.deepEqual(
    withRandomSequence([0.75, 0.25, 0.5], () =>
        multiCycleChainService.roll(baseContext).map((drop) => drop.itemId),
    ),
    [13273, 1289],
    "an explicitly multi-cycle chain short-circuits each declared cycle independently",
);

const callistoSecondaryService = new DropRollService({
    get: () => resolveDropTable({
        pools: [
            {
                kind: "weighted",
                category: "main",
                rollGroupId: "wiki:exclusive:1",
                entries: [{ itemId: 1289, rarity: 1 }],
            },
            {
                kind: "weighted",
                category: "secondary",
                rollGroupId: "wiki:secondary:secondary-supply-roll:1",
                entries: [{ itemId: 995, quantity: 100, rarity: 1 }],
            },
        ],
    })!,
} as never);
assert.deepEqual(
    withFixedRandom(0.5, () =>
        callistoSecondaryService.roll(baseContext).map((drop) => drop.itemId),
    ),
    [1289, 995],
    "Callisto-style Secondary Supply rolls remain additional to the main outcome",
);

console.log("drop item eligibility tests passed");
