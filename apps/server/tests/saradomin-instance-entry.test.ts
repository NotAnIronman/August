import assert from "node:assert/strict";

import { resolveLocActions } from "@august/game-model/world/LocActionOverrides";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type { IScriptRegistry, LocInteractionHandler } from "@server/game/scripts/types";
import { register } from "@server/content/modules/saradomin-instance";

assert.deepEqual(resolveLocActions(26504, ["Open"]), ["Open", "Peek", "Enter Solo", "Enter Party", "Join Party"]);
const handlers = new Map<string, LocInteractionHandler>();
const registry = { registerLocInteraction: (locId: number, handler: LocInteractionHandler, action?: string) => { handlers.set(`${locId}:${action}`, handler); return { unregister() {} }; } } as unknown as IScriptRegistry;
register(registry, {} as never);

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

console.log("saradomin instance entry tests passed");
