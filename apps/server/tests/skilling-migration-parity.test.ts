import assert from "node:assert/strict";

import type { PlayerState } from "@server/game/player";
import type {
    IScriptRegistry,
    ScriptActionHandler,
    ScriptServices,
} from "@server/game/scripts/types";
import { register as registerFishing } from "@server/content/gamemodes/vanilla/skills/fishing";
import { executeTanAction } from "@server/content/gamemodes/vanilla/skills/production/tanning";
import { TANNING_RECIPES } from "@server/content/gamemodes/vanilla/skills/production/tanningData";
import { executeSmeltAction } from "@server/content/gamemodes/vanilla/skills/smithing/smelting";

const player = {
    id: 77,
    skillSystem: {
        getSkill: () => ({ baseLevel: 1, boost: 0 }),
    },
} as unknown as PlayerState;
let smeltingRefreshes = 0;
const services = {
    production: {
        updateSmeltingInterface: () => {
            smeltingRefreshes++;
        },
    },
} as unknown as ScriptServices;

const result = executeSmeltAction({
    player,
    services,
    tick: 1,
    data: {
        recipeId: "smelt_lovakite_bar",
        count: 1,
        facilityLocId: -1,
    },
} as never);
assert.equal(result.ok, false);
assert.equal(result.reason, "smelt_level");
assert.match(
    String(result.effects?.find((effect) => effect.type === "message")?.message),
    /Smithing level 45/,
    "level failure must retain priority over a simultaneous wrong-furnace failure",
);
assert.equal(smeltingRefreshes, 1, "a failed action must refresh the smelting interface");

const tanningRecipe = TANNING_RECIPES[0]!;
const tanningSlots = Array.from({ length: 28 }, (_, slot) => ({
    slot,
    itemId: slot === 0 ? tanningRecipe.inputItemId : -1,
    quantity: slot === 0 ? 1 : 0,
}));
const tanningCraftEvents: unknown[] = [];
const tanningPlayer = { id: 79 } as PlayerState;
const tanningServices = {
    inventory: {
        getInventoryItems: () => tanningSlots.map((entry) => ({ ...entry })),
        setInventorySlot: (
            _player: PlayerState,
            slot: number,
            itemId: number,
            quantity: number,
        ) => {
            tanningSlots[slot] = { slot, itemId, quantity };
        },
        addItemToInventory: () => ({ slot: -1, added: 0 }),
    },
    skills: {
        getSkill: () => ({ baseLevel: 99, boost: 0 }),
        addSkillXp: () => undefined,
    },
    animation: { playPlayerSeq: () => undefined },
    system: {
        eventBus: { emit: (_name: string, payload: unknown) => tanningCraftEvents.push(payload) },
    },
} as unknown as ScriptServices;
const tanningResult = executeTanAction({
    player: tanningPlayer,
    services: tanningServices,
    tick: 1,
    data: { recipeId: tanningRecipe.id, count: 1 },
} as never);
assert.equal(tanningResult.ok, true);
assert.equal(tanningSlots[0]?.itemId, tanningRecipe.outputItemId);
assert.deepEqual(
    tanningCraftEvents,
    [],
    "tanning must retain its pre-migration no-item:craft event contract",
);

let fishAction: ScriptActionHandler | undefined;
const fishingRegistry = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
        if (property === "registerActionHandler" && args[0] === "skill.fish") {
            fishAction = args[1] as ScriptActionHandler;
        }
        return { unregister() {} };
    },
}) as unknown as IScriptRegistry;
let baitPresent = true;
const fishingPlayer = { id: 78, level: 0 } as PlayerState;
const emptyInventory = () =>
    Array.from({ length: 28 }, (_, slot) => ({ slot, itemId: -1, quantity: 0 }));
const fishingServices = {
    getFishingSpot: () => undefined,
    data: {
        getNpcTypeLoader: () => undefined,
        getObjType: (itemId: number) => ({ name: `item-${itemId}` }),
    },
    combat: {
        getNpc: () => ({ id: 5, typeId: 100, tileX: 1, tileY: 1, level: 0, size: 1 }),
    },
    location: {
        isAdjacentToNpc: () => true,
        faceTile: () => undefined,
    },
    skills: {
        getSkill: () => ({ baseLevel: 99, boost: 0 }),
        addSkillXp: () => undefined,
    },
    inventory: {
        collectCarriedItemIds: () => [307, 313],
        findInventorySlotWithItem: (_player: PlayerState, itemId: number) =>
            itemId === 313 && baitPresent ? 0 : undefined,
        canStoreItem: () => true,
        getInventoryItems: () =>
            baitPresent
                ? [{ slot: 0, itemId: 313, quantity: 1 }, ...emptyInventory().slice(1)]
                : emptyInventory(),
        setInventorySlot: () => undefined,
        addItemToInventory: () => ({ slot: 1, added: 1 }),
    },
    animation: {
        // Model a same-tick inventory race after the precheck. The old handler
        // reported its dedicated bait-fumble message in this case.
        playPlayerSeq: () => {
            baitPresent = false;
        },
    },
    stopGatheringInteraction: () => undefined,
} as unknown as ScriptServices;
registerFishing(fishingRegistry, fishingServices);
assert(fishAction, "the fishing action handler should register");
const fishingResult = fishAction({
    player: fishingPlayer,
    tick: 1,
    data: {
        npcId: 5,
        npcTypeId: 100,
        spotId: "sea_small_net",
        methodId: "sea-bait",
        started: true,
    },
    services: fishingServices,
} as never);
assert.match(
    String(fishingResult.effects?.find((effect) => effect.type === "message")?.message),
    /fumble your bait/i,
    "an atomic bait exchange race must retain the established failure message",
);

console.log("skilling-migration-parity.test.ts: all assertions passed");
