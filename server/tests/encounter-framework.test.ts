import assert from "node:assert/strict";

import { AttackType } from "../src/game/combat/AttackType";
import {
    resolvePreferredDistanceTiles,
    shouldApproachPreferredDistance,
} from "../src/game/combat/engine/CombatPreferredDistance";
import { resolveNpcAttackAnimation } from "../src/game/combat/engine/NpcAttackAnimationResolver";
import { EncounterManager } from "../src/game/encounters/EncounterManager";
import { EncounterRegistry } from "../src/game/encounters/EncounterRegistry";
import { EncounterRuntime } from "../src/game/encounters/EncounterRuntime";
import { EncounterRandom } from "../src/game/encounters/EncounterRandom";
import { selectEncounterTargets } from "../src/game/encounters/EncounterTargetSelector";
import { scheduleEncounterTimeline } from "../src/game/encounters/EncounterTimeline";
import type { EncounterDefinition } from "../src/game/encounters/EncounterTypes";
import type { NpcState } from "../src/game/npc";
import type { PlayerState } from "../src/game/player";
import type { ServerServices } from "../src/game/ServerServices";
import { CombatDataService } from "../src/game/services/CombatDataService";

function testDefinition(): EncounterDefinition {
    return {
        id: "framework-test-boss",
        npcTypeIds: [1000, 1001],
        maxHealth: 100,
        movement: {
            wanderRadius: 12,
            aggressionRadius: 20,
            combatLeashRadius: 30,
            retreatInteractionRange: 40,
        },
        attacks: [
            {
                id: "melee",
                type: AttackType.Melee,
                rangeTiles: 1,
                speedTicks: 4,
                maxDistance: 1,
                animation: "melee",
            },
            {
                id: "ranged",
                type: AttackType.Ranged,
                rangeTiles: 8,
                speedTicks: 5,
                minDistance: 2,
                cooldownTicks: 3,
                preferredDistance: 1,
                animation: "ranged",
            },
            {
                id: "enraged-magic",
                type: AttackType.Magic,
                rangeTiles: 10,
                speedTicks: 4,
                priority: 10,
                animation: "magic",
            },
        ],
        phases: [
            { id: "normal", startsAtHealthPercent: 100, attackIds: ["melee", "ranged"] },
            { id: "enraged", startsAtHealthPercent: 50, attackIds: ["enraged-magic"] },
        ],
        thresholds: [
            { id: "summon-minions", atHealthPercent: 75 },
            { id: "shield", atHealthPercent: 50 },
            { id: "final-stand", atHealthPercent: 25 },
        ],
    };
}

function createRuntime(seed = 123): EncounterRuntime {
    return new EncounterRuntime("framework-test-boss:1", testDefinition(), 10, 1000, 80, seed);
}

function testRegistryValidation(): void {
    const registry = new EncounterRegistry();
    registry.register(testDefinition());
    assert.equal(registry.findByNpcTypeId(1001)?.id, "framework-test-boss");
    assert.throws(() => registry.register(testDefinition()), /already registered/);
    assert.throws(
        () =>
            registry.register({
                ...testDefinition(),
                id: "duplicate-form",
                npcTypeIds: [1001],
            }),
        /belongs to both/,
    );
    assert.throws(
        () =>
            new EncounterRegistry().register({
                ...testDefinition(),
                phases: [{ id: "bad", startsAtHealthPercent: 100, attackIds: ["missing"] }],
            }),
        /unknown attack/,
    );
    assert.throws(
        () =>
            new EncounterRegistry().register({
                ...testDefinition(),
                id: "invalid-preferred-distance",
                attacks: [
                    {
                        id: "bad",
                        type: AttackType.Ranged,
                        rangeTiles: 8,
                        preferredDistance: 9,
                        speedTicks: 4,
                    },
                ],
                phases: undefined,
            }),
        /preferred distance/,
    );
}

function testConditionalAndStickyAttackPlanning(): void {
    const runtime = createRuntime();
    const far = runtime.planAttack({ tick: 10, targetId: 20, targetDistance: 6 });
    assert.equal(far?.definition.id, "ranged");
    assert.equal(far?.traits.type, AttackType.Ranged);

    // Moving toward the target must not reroll the reserved attack every tick.
    const whilePathing = runtime.planAttack({ tick: 11, targetId: 20, targetDistance: 1 });
    assert.strictEqual(whilePathing, far);
    assert.equal(runtime.consumePlannedAttack(20, 11)?.definition.id, "ranged");

    // The consumed ranged attack is cooling down; melee is selected up close.
    assert.equal(
        runtime.planAttack({ tick: 12, targetId: 20, targetDistance: 1 })?.definition.id,
        "melee",
    );
}

function testThresholdsPhasesAndSharedFormHealth(): void {
    const runtime = createRuntime();
    const crossed = runtime.applyDamage(60);
    assert.deepEqual(
        crossed.map((event) => event.thresholdId),
        ["summon-minions", "shield"],
    );
    assert.equal(runtime.phaseId, "enraged");
    assert.equal(
        runtime.planAttack({ tick: 20, targetId: 20, targetDistance: 1 })?.definition.id,
        "enraged-magic",
    );

    runtime.transitionForm(11, 1001);
    assert.equal(runtime.currentNpcRuntimeId, 11);
    assert.equal(runtime.currentNpcTypeId, 1001);
    assert.equal(runtime.healthCurrent, 40, "form changes must preserve the shared health pool");
    assert.deepEqual(runtime.applyDamage(20).map((event) => event.thresholdId), ["final-stand"]);
    assert.deepEqual(runtime.applyDamage(1).map((event) => event.thresholdId), []);
}

function testOwnedResourceCleanup(): void {
    const runtime = createRuntime();
    runtime.ownNpc(99);
    runtime.ownTask("wave:1");
    runtime.ownHazard("acid:4");
    runtime.ownLocation("shield-pillar");
    const cleanup = runtime.dispose();
    assert.deepEqual([...cleanup.npcRuntimeIds].sort((a, b) => a - b), [10, 99]);
    assert.deepEqual([...cleanup.taskIds], ["wave:1"]);
    assert.deepEqual([...cleanup.hazardIds], ["acid:4"]);
    assert.deepEqual([...cleanup.locationIds], ["shield-pillar"]);
    assert.equal(runtime.lifecycle, "disposed");
    assert.equal(runtime.snapshotOwnedResources().npcRuntimeIds.size, 0);
}

function testManagerCombatBridgeAndCleanup(): void {
    const registry = new EncounterRegistry();
    registry.register(testDefinition());
    const removedNpcIds: number[] = [];
    const manager = new EncounterManager(
        registry,
        { removeNpc: (npcRuntimeId) => removedNpcIds.push(npcRuntimeId) },
        (_npcTypeId, animation) => (animation === "ranged" ? 7018 : 7000),
    );
    const npc = {
        id: 10,
        typeId: 1000,
        tileX: 5,
        tileY: 5,
        size: 1,
        getMaxHitpoints: () => 100,
    } as NpcState;
    const target = { id: 20, tileX: 10, tileY: 5, size: 1 } as PlayerState;

    manager.setCurrentTick(30);
    const rangedTraits = manager.resolveAttackTraits(npc, target);
    assert.equal(rangedTraits?.type, AttackType.Ranged);
    assert.equal(rangedTraits?.preferredDistanceTiles, 1);
    assert.equal(rangedTraits?.animationId, 7018);
    assert.equal(rangedTraits?.suppressDefaultNpcAnimation, true);
    assert.equal(
        manager.onAttackPrepared({
            attacker: { type: "npc", id: 10 },
            target: { type: "player", id: 20 },
            attackClock: 30,
            traits: {
                type: AttackType.Ranged,
                style: null,
                rangeTiles: 8,
                speedTicks: 5,
            },
        })?.definition.id,
        "ranged",
    );

    manager.getByNpcRuntimeId(10)?.ownNpc(99);
    manager.removeNpc(10);
    assert.deepEqual(removedNpcIds, [99]);
    assert.equal(manager.getByNpcRuntimeId(10), undefined);
}

function testTargetSelectionAndOwnedTimeline(): void {
    const candidates = [
        { id: 1, distance: 6, healthCurrent: 90, healthMax: 100, threat: 20 },
        { id: 2, distance: 2, healthCurrent: 20, healthMax: 100, threat: 5 },
        { id: 3, distance: 4, healthCurrent: 70, healthMax: 100, threat: 50 },
    ];
    assert.deepEqual(selectEncounterTargets(candidates, "nearest", 2).map(({ id }) => id), [2, 3]);
    assert.equal(selectEncounterTargets(candidates, "highest-threat")[0]?.id, 3);
    assert.equal(selectEncounterTargets(candidates, "lowest-health")[0]?.id, 2);
    assert.deepEqual(
        selectEncounterTargets(candidates, "random", 3, new EncounterRandom(44)).map(
            ({ id }) => id,
        ),
        selectEncounterTargets(candidates, "random", 3, new EncounterRandom(44)).map(
            ({ id }) => id,
        ),
        "random targeting must be deterministic for the same encounter seed",
    );

    const runtime = createRuntime();
    const scheduled: Array<{ id: string; tick: number; callback: () => void }> = [];
    const executed: string[] = [];
    const ids = scheduleEncounterTimeline(
        runtime,
        {
            schedule: ({ taskId, runAtTick, callback }) => {
                scheduled.push({ id: taskId, tick: runAtTick, callback });
                return taskId;
            },
        },
        100,
        "boulder",
        [
            { id: "impact", atTickOffset: 3, execute: () => executed.push("impact") },
            { id: "telegraph", atTickOffset: 0, execute: () => executed.push("telegraph") },
        ],
        {},
    );
    assert.deepEqual(scheduled.map(({ tick }) => tick), [100, 103]);
    assert.deepEqual(ids, [
        "framework-test-boss:1:boulder:telegraph",
        "framework-test-boss:1:boulder:impact",
    ]);
    for (const task of scheduled) task.callback();
    assert.deepEqual(executed, ["telegraph", "impact"]);
    assert.equal(runtime.snapshotOwnedResources().taskIds.size, 2);
}

function testCanonicalAnimationResolution(): void {
    const combatData = new CombatDataService({} as ServerServices);
    assert.equal(combatData.resolveNpcEncounterAnimation(468, "ranged"), 2988);
    assert.equal(combatData.resolveNpcEncounterAnimation(468, "magic"), 2985);
    assert.equal(combatData.resolveNpcEncounterAnimation(468, { special: 0 }), 2986);
    assert.equal(
        combatData.resolveNpcEncounterAnimation(2215, "ranged"),
        7018,
        "missing style roles should fall back to the NPC's own generic attack",
    );
    assert.equal(combatData.resolveNpcEncounterAnimation(2215, { special: 0 }), undefined);
}

function testPreferredDistanceBoundaries(): void {
    const traits = {
        type: AttackType.Ranged,
        style: null,
        rangeTiles: 10,
        preferredDistanceTiles: 1,
        speedTicks: 6,
    } as const;
    assert.equal(resolvePreferredDistanceTiles(traits), 1);
    assert.equal(shouldApproachPreferredDistance(6, traits), true);
    assert.equal(shouldApproachPreferredDistance(1, traits), false);
    assert.equal(
        resolvePreferredDistanceTiles({ ...traits, preferredDistanceTiles: 20 }),
        10,
        "runtime input is defensively clamped even though registry definitions reject this",
    );
}

function testAttackAnimationPrecedenceAndSafety(): void {
    const baseTraits = {
        type: AttackType.Ranged,
        style: null,
        rangeTiles: 10,
        speedTicks: 6,
    } as const;
    assert.equal(
        resolveNpcAttackAnimation({
            traits: { ...baseTraits, animationId: 7018 },
            specialAttackAnimation: 9000,
            defaultAttackAnimation: 422,
        }),
        7018,
    );
    assert.equal(
        resolveNpcAttackAnimation({
            traits: { ...baseTraits, suppressDefaultNpcAnimation: true },
            defaultAttackAnimation: 422,
        }),
        undefined,
        "an unresolved explicit role must not play a generic humanoid sequence",
    );
    assert.equal(
        resolveNpcAttackAnimation({
            traits: baseTraits,
            specialAttackAnimation: 9000,
            defaultAttackAnimation: 422,
        }),
        9000,
    );
    assert.equal(
        resolveNpcAttackAnimation({ traits: baseTraits, defaultAttackAnimation: 422 }),
        422,
    );
}

testRegistryValidation();
testConditionalAndStickyAttackPlanning();
testThresholdsPhasesAndSharedFormHealth();
testOwnedResourceCleanup();
testManagerCombatBridgeAndCleanup();
testTargetSelectionAndOwnedTimeline();
testCanonicalAnimationResolution();
testPreferredDistanceBoundaries();
testAttackAnimationPrecedenceAndSafety();

console.log("encounter framework tests passed");
