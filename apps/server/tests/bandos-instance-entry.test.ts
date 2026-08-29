import assert from "node:assert/strict";

import { resolveLocActions } from "@august/game-model/world/LocActionOverrides";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import { getNpcCombatProfile } from "@server/data/npcCombatStats";
import type {
    IScriptRegistry,
    LocInteractionHandler,
} from "@server/game/scripts/types";
import { register } from "@server/content/modules/bandos-instance";

assert.deepEqual(resolveLocActions(26503, ["Open", "Peek"]), [
    "Open",
    "Peek",
    "Enter Solo",
    "Enter Party",
    "Join Party",
]);
assert.deepEqual(resolveLocActions(1, ["Open"]), ["Open"]);

const handlers = new Map<string, LocInteractionHandler>();
const registry = {
    registerLocInteraction: (locId: number, handler: LocInteractionHandler, action?: string) => {
        handlers.set(`${locId}:${action}`, handler);
        return { unregister() {} };
    },
} as unknown as IScriptRegistry;
let graveLocRegistration: unknown[] | undefined;
let legacyGraveLocClear: unknown[] | undefined;
register(registry, {
    location: {
        replaceTemporaryLoc: (...args: unknown[]) => {
            graveLocRegistration = args;
            return {};
        },
        clearTemporaryLoc: (...args: unknown[]) => {
            legacyGraveLocClear = args;
            return false;
        },
    },
} as never);

assert.deepEqual([...handlers.keys()], [
    "26461:open",
    "26503:open",
    "26503:peek",
    "26503:enter solo",
    "26503:enter party",
    "26503:join party",
    "26366:pray",
    "26366:pray-at",
    "9359:read",
]);
assert.equal(
    graveLocRegistration,
    undefined,
    "the reclaim gravestone is no longer spawned globally for players with empty storage",
);
assert.deepEqual(legacyGraveLocClear, [
    { worldViewId: -1 },
    0,
    { x: 2858, y: 5354, level: 2 },
    2,
    10,
]);

const doorTeleports: Array<{ x: number; y: number; level: number }> = [];
const doorMessages: string[] = [];
let doorAnimation = -1;
let scheduledDoorAction: (() => void) | undefined;
const doorPlayer = {
    id: 88,
    tileX: 2851,
    tileY: 5333,
    level: 2,
    faceTile: () => undefined,
    skillSystem: { getSkill: () => ({ baseLevel: 70, boost: 0 }) },
};
const doorItems: Array<{ itemId: number }> = [];
const doorServices = {
    data: {
        getItemDefinition: (itemId: number) =>
            itemId === 2347 ? { id: 2347, name: "Hammer", noted: false } : undefined,
    },
    inventory: { getInventoryItems: () => doorItems },
    messaging: {
        sendGameMessage: (_player: unknown, message: string) => doorMessages.push(message),
    },
    movement: {
        teleportPlayer: (_player: unknown, x: number, y: number, level: number) =>
            doorTeleports.push({ x, y, level }),
    },
    animation: {
        playPlayerSeq: (_player: unknown, sequence: number) => (doorAnimation = sequence),
    },
    scheduler: { after: (_ticks: number, action: () => void) => (scheduledDoorAction = action) },
};
handlers.get("26461:open")?.({ player: doorPlayer, services: doorServices } as never);
assert.match(doorMessages.at(-1) ?? "", /need a hammer/i);
assert.equal(doorTeleports.length, 0);

doorItems.push({ itemId: 2347 });
handlers.get("26461:open")?.({ player: doorPlayer, services: doorServices } as never);
assert.equal(doorAnimation, 898);
assert.ok(scheduledDoorAction);
scheduledDoorAction?.();
assert.deepEqual(doorTeleports.at(-1), { x: 2850, y: 5333, level: 2 });

doorPlayer.tileX = 2850;
doorItems.length = 0;
handlers.get("26461:open")?.({ player: doorPlayer, services: doorServices } as never);
assert.deepEqual(doorTeleports.at(-1), { x: 2851, y: 5333, level: 2 });

const graardor = EncounterRegistry.shared.findByNpcTypeId(2215);
assert.equal(graardor?.id, "general-graardor");
assert.equal(graardor?.maxHealth, 255);
assert.deepEqual(graardor?.bossHealthBar, {
    name: "General Graardor",
    npcTypeId: 2215,
});
assert.deepEqual(
    graardor?.attacks.map(({ id, type, maxHit }) => ({ id, type, maxHit })),
    [
        { id: "melee", type: AttackType.Melee, maxHit: 60 },
        { id: "ranged", type: AttackType.Ranged, maxHit: 35 },
    ],
);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(2216)?.attacks[0]?.type, AttackType.Melee);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(2217)?.attacks[0]?.type, AttackType.Magic);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(2218)?.attacks[0]?.type, AttackType.Ranged);
assert.equal(getNpcCombatProfile(2215)?.hitpoints, 255);
assert.equal(getNpcCombatProfile(2215)?.attackBonus, 120);
assert.equal(getNpcCombatProfile(2215)?.rangedBonus, 100);
assert.deepEqual(getNpcCombatProfile(2215)?.bonuses, {
    stab: 90,
    slash: 90,
    crush: 90,
    magic: 298,
    ranged: 90,
});
assert.equal(getNpcCombatProfile(2216)?.attackLevel, 124);
assert.equal(getNpcCombatProfile(2216)?.attackBonus, 0);
assert.equal(getNpcCombatProfile(2216)?.strengthBonus, 14);
assert.equal(getNpcCombatProfile(2217)?.magicLevel, 150);
assert.equal(getNpcCombatProfile(2218)?.rangedLevel, 150);

let copiedArea: Record<string, number> | undefined;
let instanceSpec: any;
let currentInstance: { id: string; definitionId: string } | undefined;
const testPlayer = {
    id: 42,
} as any;
const testServices = {
    instances: {
        get: () => currentInstance,
        buildTemplate: (copies: readonly Record<string, number>[]) => {
            copiedArea = copies[0];
            return [];
        },
        create: (_player: unknown, spec: unknown) => {
            instanceSpec = spec;
            currentInstance = {
                id: "test-bandos-room",
                definitionId: "graardor-room",
            };
            return currentInstance;
        },
        markStarted: () => true,
    },
    messaging: { sendGameMessage: () => undefined },
};
handlers.get("26503:enter solo")?.({ player: testPlayer, services: testServices } as never);
assert.deepEqual(instanceSpec.destination, { x: 2864, y: 5354, level: 2 });
assert.deepEqual(instanceSpec.exit, { x: 2862, y: 5354, level: 2 });
assert.equal(copiedArea?.destinationChunkX, 4);
assert.equal(copiedArea?.destinationChunkY, 3);
assert.equal(copiedArea?.heightChunks, 7);

const instanceBase = {
    x: ((instanceSpec.destination.x >> 3) - 6) * 8,
    y: ((instanceSpec.destination.y >> 3) - 6) * 8,
};
assert.deepEqual(
    instanceSpec.npcs.map((npc: { id: number; offsetX: number; offsetY: number }) => ({
        id: npc.id,
        x: instanceBase.x + npc.offsetX,
        y: instanceBase.y + npc.offsetY,
    })),
    [
        { id: 2215, x: 2872, y: 5358 },
        { id: 2216, x: 2866, y: 5358 },
        { id: 2217, x: 2872, y: 5352 },
        { id: 2218, x: 2868, y: 5362 },
    ],
);

const altarMessages: string[] = [];
let prayerBoostTarget = -1;
let prayerReset = false;
let prayerAnimation = -1;
let prayerSound = -1;
const altarPlayer = {
    id: 77,
    skillSystem: {
        getSkill: () => ({ baseLevel: 70, boost: -30 }),
        setSkillBoost: (_skillId: number, target: number) => {
            prayerBoostTarget = target;
        },
    },
    prayer: { resetDrainAccumulator: () => (prayerReset = true) },
};
const altarServices = {
    instances: { get: () => ({ definitionId: "graardor-room" }) },
    messaging: {
        sendGameMessage: (_player: unknown, message: string) => altarMessages.push(message),
    },
    animation: {
        playPlayerSeq: (_player: unknown, sequence: number) => (prayerAnimation = sequence),
    },
    sound: { sendSound: (_player: unknown, sound: number) => (prayerSound = sound) },
};
handlers.get("26366:pray")?.({
    player: altarPlayer,
    services: altarServices,
    tick: 100,
} as never);
assert.equal(prayerBoostTarget, 70);
assert.equal(prayerReset, true);
assert.equal(prayerAnimation, 645);
assert.ok(prayerSound >= 0);

handlers.get("26366:pray")?.({
    player: altarPlayer,
    services: altarServices,
    tick: 101,
} as never);
assert.match(altarMessages.at(-1) ?? "", /already blessed you recently/i);

console.log("bandos instance entry tests passed");
