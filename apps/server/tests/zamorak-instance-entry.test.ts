import assert from "node:assert/strict";

import { resolveLocActions } from "@august/game-model/world/LocActionOverrides";
import { getLocInteractionRangeOverride } from "@august/game-model/world/LocRouteOverrides";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type { IScriptRegistry, LocInteractionHandler } from "@server/game/scripts/types";
import { register } from "@server/content/modules/zamorak-instance";

assert.deepEqual(resolveLocActions(26505, ["Open"]), [
    "Open", "Peek", "Enter Solo", "Enter Party", "Join Party",
]);
assert.equal(getLocInteractionRangeOverride(26518), 2);

const handlers = new Map<string, LocInteractionHandler>();
const registry = {
    registerLocInteraction: (locId: number, handler: LocInteractionHandler, action?: string) => {
        handlers.set(`${locId}:${action}`, handler);
        return { unregister() {} };
    },
} as unknown as IScriptRegistry;
register(registry, {} as never);
assert.deepEqual([...handlers.keys()], [
    "26505:open", "26505:peek", "26505:enter solo", "26505:enter party", "26505:join party",
    "26363:pray", "26363:pray-at", "26518:climb-off", "26518:undefined",
]);

const kril = EncounterRegistry.shared.findByNpcTypeId(3129);
assert.equal(kril?.id, "kril-tsutsaroth");
assert.equal(kril?.maxHealth, 255);
assert.deepEqual(kril?.immunities, { poison: true, venom: true });
assert.deepEqual(kril?.attacks.map(({ id, type, maxHit }) => ({ id, type, maxHit })), [
    { id: "melee", type: AttackType.Melee, maxHit: 46 },
    { id: "magic", type: AttackType.Magic, maxHit: 30 },
    { id: "prayer-smash", type: AttackType.Melee, maxHit: 49 },
]);
assert.equal(kril?.attacks[2]?.condition?.({ targetProtectingFromMelee: true } as never), true);
assert.equal(kril?.attacks[2]?.condition?.({ targetProtectingFromMelee: false } as never), false);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(3130)?.attacks[0]?.type, AttackType.Melee);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(3131)?.attacks[0]?.type, AttackType.Ranged);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(3132)?.attacks[0]?.type, AttackType.Magic);

let instanceSpec: any;
let currentInstance: { id: string; definitionId: string } | undefined;
const instanceServices = {
    instances: {
        get: () => currentInstance,
        buildTemplate: () => [],
        create: (_player: unknown, spec: unknown) => {
            instanceSpec = spec;
            currentInstance = { id: "test-kril-room", definitionId: "kril-room" };
            return currentInstance;
        },
        markStarted: () => true,
    },
    messaging: { sendGameMessage: () => undefined },
};
handlers.get("26505:enter solo")?.({ player: { id: 1 }, services: instanceServices } as never);
assert.deepEqual(instanceSpec.destination, { x: 2925, y: 5332, level: 2 });
assert.deepEqual(instanceSpec.exit, { x: 2925, y: 5333, level: 2 });
assert.deepEqual(instanceSpec.grave, { locId: 9359, tile: { x: 2925, y: 5335 }, level: 2 });

const teleports: Array<{ x: number; y: number; level: number }> = [];
const bridgeMessages: string[] = [];
let prayer = 50;
const bridgePlayer = {
    tileY: 5331,
    tileX: 2885,
    level: 2,
    skillSystem: {
        getSkill: (skill: number) => skill === 3 ? { baseLevel: 70, boost: 0 } : { baseLevel: 70, boost: prayer - 70 },
        setSkillBoost: (_skill: number, target: number) => (prayer = target),
    },
    prayer: { resetDrainAccumulator: () => undefined },
    clearPendingSeqs: () => undefined,
};
const bridgeServices = {
    messaging: { sendGameMessage: (_player: unknown, message: string) => bridgeMessages.push(message) },
    movement: {
        teleportPlayer: (_player: unknown, x: number, y: number, level: number) => teleports.push({ x, y, level }),
        queueForcedMovement: () => undefined,
    },
    animation: { playPlayerSeq: () => undefined },
};
handlers.get("26518:climb-off")?.({ player: bridgePlayer, services: bridgeServices, tile: { x: 2885, y: 5331 }, tick: 1 } as never);
assert.deepEqual(teleports.at(-1), { x: 2885, y: 5347, level: 2 });
assert.equal(prayer, 0);
assert.equal(bridgeMessages.at(-1), "Dripping, you climb out of the water.");

bridgePlayer.tileY = 5347;
bridgePlayer.tileX = 2885;
prayer = 42;
handlers.get("26518:climb-off")?.({ player: bridgePlayer, services: bridgeServices, tile: { x: 2885, y: 5347 }, tick: 2 } as never);
assert.deepEqual(teleports.at(-1), { x: 2885, y: 5331, level: 2 });
assert.equal(prayer, 42, "returning across the bridge must not drain Prayer");

console.log("zamorak instance entry tests passed");
