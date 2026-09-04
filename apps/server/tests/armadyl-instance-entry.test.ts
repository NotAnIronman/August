import assert from "node:assert/strict";

import { resolveLocActions } from "@august/game-model/world/LocActionOverrides";
import { AttackType } from "@server/game/combat/AttackType";
import { canMeleeHitAirborneAviansie, isAirborneAviansie } from "@server/game/combat/CombatRules";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type { IScriptRegistry, LocInteractionHandler } from "@server/game/scripts/types";
import { register } from "@server/content/modules/armadyl-instance";

assert.deepEqual(resolveLocActions(26502, ["Open"]), ["Open", "Peek", "Enter Solo", "Enter Party", "Join Party"]);
const handlers = new Map<string, LocInteractionHandler>();
const registry = { registerCleanup: () => undefined, registerLocInteraction: (locId: number, handler: LocInteractionHandler, action?: string) => { handlers.set(`${locId}:${action}`, handler); return { unregister() {} }; }, registerNpcAttack: () => ({ unregister() {} }) } as unknown as IScriptRegistry;
register(registry, {} as never);
assert.deepEqual([...handlers.keys()], [
    "26380:grapple",
    "26380:undefined",
    "26519:search",
    "26365:pray",
    "26365:pray-at",
    "26502:open",
    "26502:enter solo",
    "26502:enter party",
    "26502:join party",
]);

const kree = EncounterRegistry.shared.findByNpcTypeId(3162);
assert.equal(kree?.id, "kreearra");
assert.equal(kree?.maxHealth, 255);
assert.deepEqual(kree?.immunities, { poison: true, venom: true });
assert.deepEqual(kree?.attacks.map(({ id, type, maxHit, speedTicks, effects }) => ({ id, type, maxHit, speedTicks, defence: effects?.defenceRollAttackType })), [
    { id: "ranged-tornado", type: AttackType.Ranged, maxHit: 69, speedTicks: 3, defence: undefined },
    { id: "magic-tornado", type: AttackType.Magic, maxHit: 21, speedTicks: 3, defence: AttackType.Ranged },
    { id: "melee", type: AttackType.Melee, maxHit: 26, speedTicks: 3, defence: undefined },
]);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(3163)?.attacks[0]?.maxHit, 16);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(3164)?.attacks[0]?.maxHit, 25);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(3165)?.attacks[0]?.maxHit, 15);
assert.equal(isAirborneAviansie(3162), true);
assert.equal(isAirborneAviansie(3181), true);
assert.equal(isAirborneAviansie(3182), false);
assert.equal(canMeleeHitAirborneAviansie(12), true);
assert.equal(canMeleeHitAirborneAviansie(31), true);
assert.equal(canMeleeHitAirborneAviansie(0), false);

const messages: string[] = [];
let received = 0;
const cratePlayer = { items: {}, skillSystem: { getSkill: () => ({ baseLevel: 70 }) } };
const crateServices = {
    messaging: { sendGameMessage: (_player: unknown, message: string) => messages.push(message) },
    inventory: { addItemToInventory: () => ({ slot: 0, added: 1 }), snapshotInventoryImmediate: () => { received++; } },
};
handlers.get("26519:search")?.({ player: cratePlayer, services: crateServices, tick: 0 } as never);
assert.equal(received, 1);
assert.equal(messages.at(-1), "You find a mithril grapple in the crate.");
handlers.get("26519:search")?.({ player: cratePlayer, services: crateServices, tick: 499 } as never);
assert.equal(received, 1);
assert.equal(messages.at(-1), "You have already searched this crate recently.");

let copiedArea: Record<string, number> | undefined;
let instanceSpec: any;
let startedRoomId: string | undefined;
const instanceServices = {
    instances: {
        get: () => undefined,
        buildTemplate: (copies: readonly Record<string, number>[]) => {
            copiedArea = copies[0];
            return [];
        },
        create: (_player: unknown, spec: unknown) => {
            instanceSpec = spec;
            return { id: "test-kree-room" };
        },
        markStarted: (id: string) => {
            startedRoomId = id;
            return true;
        },
    },
    messaging: { sendGameMessage: () => undefined },
};
handlers.get("26502:enter solo")?.({ player: { id: 1 }, services: instanceServices } as never);
assert.deepEqual(instanceSpec.destination, { x: 2839, y: 5295, level: 2 });
assert.deepEqual(instanceSpec.exit, { x: 2839, y: 5294, level: 2 });
assert.deepEqual(instanceSpec.grave, { locId: 9359, tile: { x: 2839, y: 5292 }, level: 2 });
assert.deepEqual(instanceSpec.npcs.map((npc: { id: number }) => npc.id), [3162, 3163, 3164, 3165]);
assert.equal(copiedArea?.destinationChunkX, 3);
assert.equal(copiedArea?.destinationChunkY, 5);
assert.equal(startedRoomId, "test-kree-room");

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
    instances: { get: () => ({ definitionId: "kreearra-room" }) },
    messaging: { sendGameMessage: (_player: unknown, message: string) => altarMessages.push(message) },
    animation: { playPlayerSeq: () => undefined },
    sound: { sendSound: () => undefined },
};
handlers.get("26365:pray")?.({ player: altarPlayer, services: altarServices, tick: 100 } as never);
assert.equal(prayerTarget, 70);
handlers.get("26365:pray")?.({ player: altarPlayer, services: altarServices, tick: 101 } as never);
assert.equal(altarMessages.at(-1), "The gods have already blessed you recently.");

console.log("armadyl instance entry tests passed");
