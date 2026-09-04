import assert from "node:assert/strict";

import { AttackType } from "@server/game/combat/AttackType";
import { EncounterManager } from "@server/game/encounters/EncounterManager";
import {
    EncounterRegistry,
    registerOwnedEncounter,
} from "@server/game/encounters/EncounterRegistry";
import type { EncounterDefinition } from "@server/game/encounters/EncounterTypes";
import { createMechanicHandle } from "@server/game/encounters/mechanics/MechanicHandle";
import type { NpcState } from "@server/game/npc";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";
import type { ScriptServices } from "@server/game/scripts/types";
import { ScriptScheduler } from "@server/game/systems/ScriptScheduler";

const encounters = EncounterRegistry.shared;
encounters.clear();

const runtime = new ScriptRuntime({
    registry: new ScriptRegistry(),
    scheduler: new ScriptScheduler(),
    services: { hotReloadEnabled: true } as unknown as ScriptServices,
    logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
    },
});

const registerProvider = (): void => {
    runtime.registerHandlers("test.owned-encounter", (owner) => {
        registerOwnedEncounter(owner, {
            id: "owned-lifecycle-test",
            npcTypeIds: [91_000],
            attacks: [
                {
                    id: "melee",
                    type: AttackType.Melee,
                    rangeTiles: 1,
                    speedTicks: 4,
                },
            ],
        });
    });
};

registerProvider();
const initial = encounters.get("owned-lifecycle-test");
assert.ok(initial);
assert.equal(encounters.findByNpcTypeId(91_000), initial);

registerProvider();
const reloaded = encounters.get("owned-lifecycle-test");
assert.ok(reloaded);
assert.notEqual(reloaded, initial, "reload must replace, not retain, provider-owned data");
assert.equal(
    encounters.values().filter((entry) => entry.id === "owned-lifecycle-test").length,
    1,
    "reload must leave exactly one encounter definition",
);

runtime.reset();
assert.equal(encounters.get("owned-lifecycle-test"), undefined);
assert.equal(encounters.findByNpcTypeId(91_000), undefined);

const localRegistry = new EncounterRegistry();
const removedDefinitions: EncounterDefinition[] = [];
localRegistry.onUnregistered((definition) => removedDefinitions.push(definition));
const cancelledTasks: Array<string | number> = [];
const encounterManager = new EncounterManager(localRegistry, {
    cancelTask: (taskId) => cancelledTasks.push(taskId),
});
const definition = {
    id: "runtime-unload-test",
    npcTypeIds: [91_001],
    attacks: [{
        id: "melee",
        type: AttackType.Melee,
        rangeTiles: 1,
        speedTicks: 4,
    }],
} satisfies EncounterDefinition;
const unregisterDefinition = localRegistry.register(definition);
const npc = {
    id: 101,
    typeId: 91_001,
    getHitpoints: () => 100,
    getMaxHitpoints: () => 100,
} as NpcState;
const activeRuntime = encounterManager.ensureForNpc(npc);
assert.ok(activeRuntime);
activeRuntime.ownTask("provider-owned-task");
let mechanicCancellations = 0;
const activeMechanic = createMechanicHandle("provider-owned-mechanic", () => {
    mechanicCancellations += 1;
});
activeRuntime.ownMechanic(activeMechanic);

unregisterDefinition();
assert.equal(activeRuntime.lifecycle, "disposed");
assert.equal(activeMechanic.isActive, false);
assert.equal(mechanicCancellations, 1);
assert.equal(encounterManager.getByNpcRuntimeId(npc.id), undefined);
assert.deepEqual(cancelledTasks, ["provider-owned-task"]);
assert.deepEqual(removedDefinitions, [definition]);

const replacement = {
    ...definition,
    attacks: [{
        id: "magic",
        type: AttackType.Magic,
        rangeTiles: 10,
        speedTicks: 5,
    }],
} satisfies EncounterDefinition;
localRegistry.register(replacement);
const replacementRuntime = encounterManager.ensureForNpc(npc);
assert.ok(replacementRuntime);
unregisterDefinition();
assert.equal(
    encounterManager.getByNpcRuntimeId(npc.id),
    replacementRuntime,
    "a stale disposer must not remove a replacement runtime",
);

localRegistry.clear();
assert.equal(replacementRuntime.lifecycle, "disposed");
assert.equal(encounterManager.getByNpcRuntimeId(npc.id), undefined);
assert.deepEqual(removedDefinitions, [definition, replacement]);
encounterManager.dispose();

const ownershipRegistry = new EncounterRegistry();
const removedOwnedNpcs: number[] = [];
const ownershipManager = new EncounterManager(ownershipRegistry, {
    removeNpc: (npcRuntimeId) => removedOwnedNpcs.push(npcRuntimeId),
});
const parentDefinition = {
    id: "provider-parent",
    npcTypeIds: [91_010],
    attacks: [{ id: "melee", type: AttackType.Melee, rangeTiles: 1, speedTicks: 4 }],
} satisfies EncounterDefinition;
const childDefinition = {
    id: "provider-child",
    npcTypeIds: [91_011],
    attacks: [{ id: "melee", type: AttackType.Melee, rangeTiles: 1, speedTicks: 4 }],
} satisfies EncounterDefinition;
const unregisterParent = ownershipRegistry.register(parentDefinition);
const unregisterChild = ownershipRegistry.register(childDefinition);
const parentNpc = {
    id: 201, typeId: 91_010, getHitpoints: () => 100, getMaxHitpoints: () => 100,
} as NpcState;
const childNpc = {
    id: 202, typeId: 91_011, getHitpoints: () => 100, getMaxHitpoints: () => 100,
} as NpcState;
const parentRuntime = ownershipManager.ensureForNpc(parentNpc);
const childRuntime = ownershipManager.ensureForNpc(childNpc);
assert.ok(parentRuntime);
assert.ok(childRuntime);
parentRuntime.ownNpc(childNpc.id);

unregisterChild();
assert.equal(childRuntime.lifecycle, "disposed");
assert.equal(
    parentRuntime.snapshotOwnedResources().npcRuntimeIds.has(childNpc.id),
    true,
    "unregistering a child's definition does not mean its live actor was physically removed",
);
unregisterParent();
assert.deepEqual(
    removedOwnedNpcs,
    [childNpc.id],
    "the parent provider must still clean its live owned child during reverse-order unload",
);
ownershipManager.dispose();

console.log("encounter registration lifecycle contract tests passed");
