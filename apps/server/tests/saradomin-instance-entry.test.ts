import assert from "node:assert/strict";

import { resolveLocActions } from "@august/game-model/world/LocActionOverrides";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type { IScriptRegistry, LocInteractionHandler } from "@server/game/scripts/types";
import { register } from "@server/content/modules/saradomin-instance";

assert.deepEqual(resolveLocActions(26504, ["Open"]), ["Open", "Peek", "Enter Solo", "Enter Party", "Join Party"]);
const handlers = new Map<string, LocInteractionHandler>();
const registry = { registerCleanup: () => undefined, registerLocInteraction: (locId: number, handler: LocInteractionHandler, action?: string) => { handlers.set(`${locId}:${action}`, handler); return { unregister() {} }; } } as unknown as IScriptRegistry;
register(registry, {} as never);
assert.deepEqual([...handlers.keys()], [
    "26504:open",
    "26504:peek",
    "26504:enter solo",
    "26504:enter party",
    "26504:join party",
    "26561:tie-rope",
    "26562:tie-rope",
    "26364:pray",
    "26364:pray-at",
    "26372:climb-down",
    "26374:climb-up",
    "26376:climb-down",
    "26378:climb-up",
]);

const zilyana = EncounterRegistry.shared.findByNpcTypeId(2205);
assert.equal(zilyana?.id, "commander-zilyana");
assert.equal(zilyana?.maxHealth, 255);
assert.deepEqual(zilyana?.immunities, { poison: true, venom: true });
assert.deepEqual(zilyana?.attacks.map(({ type, maxHit, speedTicks }) => ({ type, maxHit, speedTicks })), [
    { type: AttackType.Melee, maxHit: 27, speedTicks: 2 },
    { type: AttackType.Magic, maxHit: 20, speedTicks: 2 },
]);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(2206)?.attacks[0]?.type, AttackType.Melee);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(2207)?.attacks[0]?.type, AttackType.Magic);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(2208)?.attacks[0]?.type, AttackType.Ranged);

const messages: string[] = [];
const replacements: unknown[][] = [];
let ropes = 2;
const ropePlayer = {
    skillSystem: { getSkill: () => ({ baseLevel: 70, boost: 0 }) },
    varps: {
        getVarpValue: () => 0,
        setVarpValue: () => undefined,
    },
    items: {
        hasItem: () => ropes > 0,
        removeItem: () => { ropes--; return { completed: 1 }; },
    },
};
const ropeServices = {
    messaging: { sendGameMessage: (_player: unknown, message: string) => messages.push(message) },
    inventory: { snapshotInventoryImmediate: () => undefined },
    location: { replaceTemporaryLoc: (...args: unknown[]) => { replacements.push(args); return {}; } },
    variables: { sendVarp: () => undefined },
};
handlers.get("26561:tie-rope")?.({ player: ropePlayer, services: ropeServices, locId: 26561, tile: { x: 2912, y: 5300 }, level: 2 } as never);
assert.equal(ropes, 1);
assert.equal(replacements[0]?.[2], 26372);
assert.equal(replacements[1]?.[2], 26374);
assert.equal((replacements[0]?.[5] as { newRotation: number }).newRotation, 2);
assert.equal(messages.at(-1), "You tie the rope securely to the rock.");

handlers.get("26562:tie-rope")?.({ player: ropePlayer, services: ropeServices, locId: 26562, tile: { x: 2920, y: 5276 }, level: 1 } as never);
assert.equal(replacements[2]?.[2], 26376);
assert.equal(replacements[3]?.[2], 26378);
assert.deepEqual(replacements[3]?.[3], { x: 2920, y: 5274, level: 0 });
assert.equal((replacements[2]?.[5] as { newRotation: number }).newRotation, 3);

let copiedArea: Record<string, number> | undefined;
let instanceSpec: any;
const instanceServices = {
    instances: {
        get: () => undefined,
        buildTemplate: (copies: readonly Record<string, number>[]) => {
            copiedArea = copies[0];
            return [];
        },
        create: (_player: unknown, spec: unknown) => {
            instanceSpec = spec;
            return { id: "test-zilyana-room" };
        },
        markStarted: () => true,
    },
    messaging: { sendGameMessage: () => undefined },
};
handlers.get("26504:enter solo")?.({ player: { id: 1 }, services: instanceServices } as never);
assert.deepEqual(instanceSpec.destination, { x: 2908, y: 5265, level: 0 });
assert.deepEqual(instanceSpec.exit, { x: 2909, y: 5265, level: 0 });
assert.deepEqual(instanceSpec.grave, { locId: 9359, tile: { x: 2910, y: 5267 }, level: 0 });
assert.deepEqual(instanceSpec.npcs.map((npc: { id: number }) => npc.id), [2205, 2206, 2207, 2208]);
assert.equal(copiedArea?.destinationChunkX, 3);
assert.equal(copiedArea?.destinationChunkY, 4);

let prayerTarget = -1;
const altarMessages: string[] = [];
const altarPlayer = {
    id: 2,
    skillSystem: {
        getSkill: () => ({ baseLevel: 70, boost: -10 }),
        setSkillBoost: (_skill: number, target: number) => (prayerTarget = target),
    },
    prayer: { resetDrainAccumulator: () => undefined },
};
const altarServices = {
    instances: { get: () => ({ definitionId: "zilyana-room" }) },
    messaging: { sendGameMessage: (_player: unknown, message: string) => altarMessages.push(message) },
    animation: { playPlayerSeq: () => undefined },
    sound: { sendSound: () => undefined },
};
handlers.get("26364:pray")?.({ player: altarPlayer, services: altarServices, tick: 100 } as never);
assert.equal(prayerTarget, 70);
handlers.get("26364:pray")?.({ player: altarPlayer, services: altarServices, tick: 101 } as never);
assert.equal(altarMessages.at(-1), "The gods have already blessed you recently.");

console.log("saradomin instance entry tests passed");
