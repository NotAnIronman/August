import assert from "node:assert/strict";

import { resolveLocActions } from "@august/game-model/world/LocActionOverrides";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type { IScriptRegistry, LocInteractionHandler } from "@server/game/scripts/types";
import { register } from "@server/content/modules/armadyl-instance";

assert.deepEqual(resolveLocActions(26502, ["Open"]), ["Open", "Peek", "Enter Solo", "Enter Party", "Join Party"]);
const handlers = new Map<string, LocInteractionHandler>();
const registry = { registerLocInteraction: (locId: number, handler: LocInteractionHandler, action?: string) => { handlers.set(`${locId}:${action}`, handler); return { unregister() {} }; }, registerNpcAttack: () => ({ unregister() {} }) } as unknown as IScriptRegistry;
register(registry, {} as never);

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

console.log("armadyl instance entry tests passed");
