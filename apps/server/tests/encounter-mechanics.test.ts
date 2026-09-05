import assert from "node:assert/strict";

import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import {
    createMechanicHandle,
    MechanicRegistry,
    spawnAdds,
    spawnFloorHazard,
} from "@server/game/encounters/mechanics";
import type { EncounterDefinition } from "@server/game/encounters/EncounterTypes";
import type { ScriptServices } from "@server/game/scripts/types";

function createRuntime(seed = 123): EncounterRuntime {
    const definition: EncounterDefinition = {
        id: "mechanic-test",
        npcTypeIds: [9000],
        maxHealth: 100,
        attacks: [{ id: "melee", type: AttackType.Melee, rangeTiles: 1, speedTicks: 4 }],
    };
    return new EncounterRuntime("mechanic-test:1", definition, 10, 9000, 100, seed);
}

function createHarness(): {
    readonly services: ScriptServices;
    readonly runTask: (id: number, tick: number) => void;
    readonly cancelled: number[];
    readonly graphics: unknown[];
    readonly damages: Array<{ playerId: number; amount: number }>;
    readonly spawned: any[];
    readonly removed: number[];
    readonly engaged: number[];
    readonly defeatSource: () => void;
} {
    let nextTaskId = 1;
    let nextNpcId = 100;
    const tasks = new Map<number, (tick: number) => void>();
    const cancelled: number[] = [];
    const graphics: unknown[] = [];
    const damages: Array<{ playerId: number; amount: number }> = [];
    const spawned: any[] = [];
    const liveNpcs = new Map<number, any>();
    const removed: number[] = [];
    const engaged: number[] = [];
    let sourceHitpoints = 100;
    const source = {
        id: 10, tileX: 50, tileY: 50, level: 0, worldViewId: 1, ownerPlayerId: 7,
        getHitpoints: () => sourceHitpoints,
    };
    const services = {
        combat: {
            getNpc: (id: number) => (id === source.id ? source : liveNpcs.get(id)),
            applyNpcDamageToPlayer: (_source: unknown, player: { id: number }, _hitmark: unknown, amount: number) => {
                damages.push({ playerId: player.id, amount });
            },
        },
        animation: { playLocGraphic: (request: unknown) => graphics.push(request) },
        projectiles: { launch: () => {} },
        scheduler: {
            after: (_delay: number, callback: (tick: number) => void) => {
                const id = nextTaskId++;
                tasks.set(id, callback);
                return id;
            },
            cancel: (id: number) => {
                cancelled.push(id);
                tasks.delete(id);
            },
        },
        npc: {
            spawnNpc: (request: Record<string, unknown>) => {
                const npc = { ...request, id: nextNpcId++ };
                spawned.push(npc);
                liveNpcs.set(npc.id, npc);
                return npc;
            },
            removeNpc: (id: number) => {
                liveNpcs.delete(id);
                removed.push(id);
            },
            engageCombat: (npc: { id: number }) => engaged.push(npc.id),
        },
    } as unknown as ScriptServices;
    return {
        services,
        runTask: (id, tick) => tasks.get(id)?.(tick),
        cancelled,
        graphics,
        damages,
        spawned,
        removed,
        engaged,
        defeatSource: () => { sourceHitpoints = 0; },
    };
}

function testReentrancyAndLifecycleCleanup(): void {
    const runtime = createRuntime();
    let cancelled = 0;
    const first = runtime.runMechanic("adds", "ignore", () =>
        createMechanicHandle("first", () => { cancelled += 1; }),
    );
    const ignored = runtime.runMechanic("adds", "ignore", () => {
        throw new Error("ignore must not create a second mechanic");
    });
    assert.strictEqual(ignored, first);

    const replacement = runtime.runMechanic("adds", "replace", () =>
        createMechanicHandle("replacement", () => { cancelled += 10; }),
    );
    assert.equal(cancelled, 1, "replace must cancel the old mechanic before creating a new one");
    assert.equal(replacement?.isActive, true);

    const stacked = runtime.runMechanic("hazards", "stack", () =>
        createMechanicHandle("stacked", () => { cancelled += 100; }),
    );
    assert.equal(stacked?.isActive, true);
    runtime.resetHealth();
    assert.equal(cancelled, 111, "a reset must cancel every active mechanic");
    assert.equal(first?.isActive, false);
    assert.equal(replacement?.isActive, false);
    assert.equal(stacked?.isActive, false);
}

function testRegistryIsolation(): void {
    const registry = new MechanicRegistry();
    const runtime = createRuntime();
    registry.register("works", () => createMechanicHandle("works", () => {}));
    assert.equal(registry.run("works", runtime, {} as ScriptServices, {}).isActive, true);
    assert.equal(registry.run("missing", runtime, {} as ScriptServices, {}).isActive, false);
    registry.register("throws", () => { throw new Error("intentional test failure"); });
    assert.equal(registry.run("throws", runtime, {} as ScriptServices, {}).isActive, false);
    assert.throws(
        () => registry.register("works", () => createMechanicHandle("duplicate", () => {})),
        /already registered/,
    );
}

function testFloorHazard(): void {
    const runtime = createRuntime();
    const harness = createHarness();
    const playerOnTile = { id: 1, tileX: 51, tileY: 50, level: 0, worldViewId: 1 };
    const secondPlayerOnTile = { id: 2, tileX: 51, tileY: 50, level: 0, worldViewId: 1 };
    let nextDamage = 17;
    const hazard = spawnFloorHazard(runtime, harness.services, {
        id: "boulder",
        tiles: [{ x: 51, y: 50, level: 0 }],
        graphicId: 60,
        telegraphTicks: 5,
        liveTicks: 1,
        damage: () => nextDamage++,
        players: [playerOnTile, secondPlayerOnTile] as never,
    });
    assert.equal(harness.graphics.length, 1, "hazards telegraph immediately");
    harness.runTask(1, 5);
    assert.deepEqual(harness.damages, [
        { playerId: 1, amount: 17 },
        { playerId: 2, amount: 18 },
    ], "damage functions roll independently for each player struck");
    assert.equal(hazard.isActive, false, "the final impact releases its mechanic handle");

    const cancellable = spawnFloorHazard(runtime, harness.services, {
        tiles: [{ x: 51, y: 50, level: 0 }], graphicId: 60, telegraphTicks: 5,
        liveTicks: 3, tickInterval: 1, damage: 1, players: [playerOnTile] as never,
    });
    runtime.resetHealth();
    assert.equal(cancellable.isActive, false);
    assert.ok(harness.cancelled.length >= 2, "reset cancels all pending hazard impacts");

    const sourceDeathHazard = spawnFloorHazard(runtime, harness.services, {
        tiles: [{ x: 51, y: 50, level: 0 }], graphicId: 60, telegraphTicks: 1,
        liveTicks: 1, damage: 1, players: [playerOnTile] as never,
    });
    harness.defeatSource();
    harness.runTask(5, 1);
    assert.equal(sourceDeathHazard.isActive, false, "a defeated source releases pending hazards");
}

function testSpawnAdds(): void {
    const runtime = createRuntime();
    const harness = createHarness();
    const target = { id: 1 };
    const adds = spawnAdds(runtime, harness.services, {
        npcTypeId: 9001, count: 3, formation: "line", target: target as never, lifetimeTicks: 20,
    });
    assert.deepEqual(
        harness.spawned.map(({ x, y }) => [x, y]),
        [[49, 50], [50, 50], [51, 50]],
        "line formations are centered on the source NPC",
    );
    assert.equal(harness.engaged.length, 3, "adds immediately engage the requested target");
    adds.cancel();
    assert.deepEqual(harness.removed, [100, 101, 102], "cancelling removes every owned add");
}

testReentrancyAndLifecycleCleanup();
testRegistryIsolation();
testFloorHazard();
testSpawnAdds();

const permanentRuntime = createRuntime();
const permanentHarness = createHarness();
const permanent = spawnFloorHazard(permanentRuntime, permanentHarness.services, {
    tiles: [{ x: 50, y: 50, level: 0 }], liveTicks: "encounter", tickInterval: 2,
    hazardDamage: 5, players: [{ id: 7, tileX: 50, tileY: 50, level: 0, worldViewId: 1 }] as never,
});
for (let id = 1; id <= 20; id++) permanentHarness.runTask(id, id * 2);
assert.equal(permanentHarness.damages.length, 20, "permanent hazards keep pulsing beyond normal lifetime");
assert(permanent.isActive);
permanentRuntime.dispose();
assert.equal(permanent.isActive, false);
assert.deepEqual(permanentHarness.cancelled, [21], "only one future pulse exists; encounter cleanup cancels it");

const overlapRuntime = createRuntime();
const overlapHarness = createHarness();
let clearedTells = 0;
(overlapHarness.services as any).location = { replaceTemporaryLoc() {}, clearTemporaryLoc() { clearedTells++; } };
const tellParams = { tiles: [{ x: 50, y: 50, level: 0 }], tell: { locId: 56358 }, players: [] };
const longPatch = spawnFloorHazard(overlapRuntime, overlapHarness.services, { ...tellParams, liveTicks: "encounter" });
const shortPatch = spawnFloorHazard(overlapRuntime, overlapHarness.services, { ...tellParams, liveTicks: 1 });
shortPatch.cancel();
assert.equal(clearedTells, 0, "temporary acid cannot erase overlapping permanent poison");
longPatch.cancel();
assert.equal(clearedTells, 1);

console.log("encounter mechanic tests passed");
