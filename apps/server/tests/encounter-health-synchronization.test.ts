import assert from "node:assert/strict";

import { AttackType } from "@server/game/combat/AttackType";
import { CombatEffectApplicator } from "@server/game/combat/CombatEffectApplicator";
import {
    HITMARK_DAMAGE,
    HITMARK_HEAL,
    HITMARK_POISON,
    HITMARK_VENOM,
} from "@server/game/combat/HitEffects";
import { EncounterManager } from "@server/game/encounters/EncounterManager";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type { EncounterDefinition } from "@server/game/encounters/EncounterTypes";
import { NpcState } from "@server/game/npc";

const applicator = new CombatEffectApplicator();

function definition(typeId: number, maxHealth: number): EncounterDefinition {
    return {
        id: `health-sync-${typeId}`,
        npcTypeIds: [typeId],
        maxHealth,
        attacks: [
            {
                id: "melee",
                type: AttackType.Melee,
                rangeTiles: 1,
                speedTicks: 4,
            },
        ],
        phases: [
            { id: "normal", startsAtHealthPercent: 100 },
            { id: "wounded", startsAtHealthPercent: 50 },
        ],
        thresholds: [{ id: "three-quarters", atHealthPercent: 75 }],
    };
}

function createEncounter(typeId: number, maxHealth: number = 100) {
    const registry = new EncounterRegistry();
    registry.register(definition(typeId, maxHealth));
    const manager = new EncounterManager(registry);
    const npc = new NpcState(
        typeId + 1,
        typeId,
        1,
        -1,
        -1,
        32,
        { x: 3200, y: 3200, level: 0 },
        { maxHitpoints: maxHealth },
    );
    const runtime = manager.ensureForNpc(npc);
    assert.ok(runtime);
    return { manager, npc, runtime };
}

function testOrdinaryDamageHealingAndRegenerationStayAligned(): void {
    const { npc, runtime } = createEncounter(81_000);

    const ordinary = applicator.applyNpcHitsplat(npc, HITMARK_DAMAGE, 30, 1);
    assert.equal(ordinary.amount, 30);
    assert.equal(npc.getHitpoints(), 70);
    assert.equal(runtime.healthCurrent, 70);

    applicator.applyNpcHitsplat(npc, HITMARK_HEAL, 10, 2);
    assert.equal(npc.getHitpoints(), 80);
    assert.equal(runtime.healthCurrent, 80, "direct heals must update encounter health");

    npc.startRegeneration(5, 1, 2, 1);
    assert.equal(npc.tickStatusEffects(3)?.[0]?.amount, 5);
    assert.equal(npc.getHitpoints(), 85);
    assert.equal(runtime.healthCurrent, 85, "regeneration ticks use the same HP observer");

    const lethal = applicator.applyNpcHitsplat(npc, HITMARK_DAMAGE, 999, 4);
    assert.equal(lethal.amount, 85, "the NPC reports actual post-clamp damage");
    assert.equal(runtime.healthCurrent, 0);
    assert.equal(runtime.lifecycle, "dead");
}

function testPoisonAndVenomDirectHitsUseActualPostClampHealth(): void {
    const poison = createEncounter(81_010, 20);
    applicator.applyNpcHitsplat(poison.npc, HITMARK_POISON, 7, 1);
    assert.equal(poison.npc.getHitpoints(), 13);
    assert.equal(poison.runtime.healthCurrent, 13);
    applicator.applyNpcHitsplat(poison.npc, HITMARK_POISON, 100, 2);
    assert.equal(poison.npc.getHitpoints(), 0);
    assert.equal(poison.runtime.healthCurrent, 0, "poison overkill must not double-apply");
    assert.equal(poison.runtime.lifecycle, "dead");

    const venom = createEncounter(81_020, 20);
    applicator.applyNpcHitsplat(venom.npc, HITMARK_VENOM, 6, 1);
    assert.equal(venom.npc.getHitpoints(), 14);
    assert.equal(venom.runtime.healthCurrent, 14);
    applicator.applyNpcHitsplat(venom.npc, HITMARK_VENOM, 100, 2);
    assert.equal(venom.npc.getHitpoints(), 0);
    assert.equal(venom.runtime.healthCurrent, 0, "venom overkill must not double-apply");
    assert.equal(venom.runtime.lifecycle, "dead");
}

function testPoisonAndVenomStatusTicksUseTheSameObserver(): void {
    const poison = createEncounter(81_030, 10);
    assert.equal(poison.npc.inflictPoison(4, 0, 1), true);
    assert.equal(poison.npc.tickStatusEffects(1)?.[0]?.amount, 4);
    assert.equal(poison.runtime.healthCurrent, 6);
    poison.npc.inflictPoison(20, 1, 1);
    poison.npc.tickStatusEffects(2);
    assert.equal(poison.npc.getHitpoints(), 0);
    assert.equal(poison.runtime.healthCurrent, 0);
    assert.equal(poison.runtime.lifecycle, "dead");

    const venom = createEncounter(81_040, 10);
    assert.equal(venom.npc.inflictVenom(4, 0, 1, 2, 20), true);
    assert.equal(venom.npc.tickStatusEffects(1)?.[0]?.amount, 4);
    assert.equal(venom.runtime.healthCurrent, 6);
    venom.npc.inflictVenom(20, 1, 1, 2, 20);
    venom.npc.tickStatusEffects(2);
    assert.equal(venom.npc.getHitpoints(), 0);
    assert.equal(venom.runtime.healthCurrent, 0);
    assert.equal(venom.runtime.lifecycle, "dead");
}

function testPreventedLethalStatusHitPublishesOnlyItsCommittedHealth(): void {
    const { npc, runtime } = createEncounter(81_045, 10);
    const generationBeforeHit = runtime.generation;
    runtime.ownTask("lethal-intercept-task");
    runtime.ownHazard("lethal-intercept-hazard");
    npc.inflictPoison(20, 0, 1);

    const commit = npc.beginHealthTransaction();
    const lethalHitsplat = npc.tickStatusEffects(1)?.[0];
    assert.equal(npc.getHitpoints(), 0);
    assert.equal(
        runtime.healthCurrent,
        10,
        "observers must not see the reversible zero-HP intermediate state",
    );
    npc.heal(1);
    if (lethalHitsplat) {
        lethalHitsplat.amount = 9;
        lethalHitsplat.hpCurrent = 1;
    }
    commit();

    assert.equal(npc.getHitpoints(), 1);
    assert.equal(runtime.healthCurrent, 1);
    assert.notEqual(runtime.lifecycle, "dead");
    assert.equal(
        runtime.generation,
        generationBeforeHit,
        "reversing a lethal hit must not be mistaken for an encounter reset",
    );
    const remaining = runtime.snapshotOwnedResources();
    assert.deepEqual([...remaining.taskIds], ["lethal-intercept-task"]);
    assert.deepEqual([...remaining.hazardIds], ["lethal-intercept-hazard"]);
}

function testAuthoritativeHealRevivesEncounterPlanningBeforeDespawn(): void {
    const { npc, runtime } = createEncounter(81_047, 10);
    applicator.applyNpcHitsplat(npc, HITMARK_DAMAGE, 10, 1);
    assert.equal(runtime.lifecycle, "dead");

    applicator.applyNpcHitsplat(npc, HITMARK_HEAL, 1, 2);
    assert.equal(npc.getHitpoints(), 1);
    assert.equal(runtime.healthCurrent, 1);
    assert.equal(runtime.lifecycle, "idle");
    assert.ok(runtime.planAttack({ tick: 2, targetId: 7, targetDistance: 1 }));
}

function testThresholdEventsDeliverOncePerLifeAndRearmOnReset(): void {
    const { manager, npc, runtime } = createEncounter(81_048);
    const delivered: string[] = [];
    manager.onThresholdCrossed((event) => delivered.push(event.thresholdId));

    applicator.applyNpcHitsplat(npc, HITMARK_DAMAGE, 30, 1);
    assert.deepEqual(delivered, ["three-quarters"]);
    applicator.applyNpcHitsplat(npc, HITMARK_HEAL, 30, 2);
    applicator.applyNpcHitsplat(npc, HITMARK_DAMAGE, 30, 3);
    assert.deepEqual(
        delivered,
        ["three-quarters"],
        "healing above a threshold must not deliver it twice in one life",
    );

    npc.resetToSpawn();
    assert.equal(runtime.healthCurrent, 100);
    applicator.applyNpcHitsplat(npc, HITMARK_DAMAGE, 30, 4);
    assert.deepEqual(delivered, ["three-quarters", "three-quarters"]);
}

function testResetCleansOwnedResourcesButPreservesTheBoss(): void {
    const typeId = 81_049;
    const registry = new EncounterRegistry();
    registry.register(definition(typeId, 100));
    const removedNpcs: number[] = [];
    const cancelledTasks: Array<string | number> = [];
    const removedHazards: string[] = [];
    const removedLocations: string[] = [];
    const manager = new EncounterManager(registry, {
        removeNpc: (id) => removedNpcs.push(id),
        cancelTask: (id) => {
            cancelledTasks.push(id);
            if (id === 77) throw new Error("simulated task-adapter failure");
        },
        removeHazard: (id) => removedHazards.push(id),
        removeLocation: (id) => removedLocations.push(id),
    });
    const npc = new NpcState(
        549,
        typeId,
        1,
        -1,
        -1,
        32,
        { x: 3200, y: 3200, level: 0 },
        { maxHitpoints: 100 },
    );
    const runtime = manager.ensureForNpc(npc);
    assert.ok(runtime);
    runtime.ownNpc(999);
    runtime.ownTask(77);
    runtime.ownTask("named-task");
    runtime.ownHazard("acid-pool");
    runtime.ownLocation("temporary-pillar");

    npc.applyDamage(25);
    assert.doesNotThrow(
        () => npc.resetToSpawn(),
        "one failing cleanup adapter must not block the remaining owned resources",
    );

    assert.equal(runtime.lifecycle, "idle");
    assert.equal(runtime.healthCurrent, 100);
    assert.deepEqual(removedNpcs, [999]);
    assert.deepEqual(cancelledTasks, [77, "named-task"]);
    assert.deepEqual(removedHazards, ["acid-pool"]);
    assert.deepEqual(removedLocations, ["temporary-pillar"]);
    const remaining = runtime.snapshotOwnedResources();
    assert.deepEqual([...remaining.npcRuntimeIds], [npc.id]);
    assert.equal(remaining.taskIds.size, 0);
    assert.equal(remaining.hazardIds.size, 0);
    assert.equal(remaining.locationIds.size, 0);
}

function testFormTransitionPreservesSharedHealthExactlyOnce(): void {
    const firstTypeId = 81_060;
    const secondTypeId = 81_061;
    const registry = new EncounterRegistry();
    registry.register({
        ...definition(firstTypeId, 100),
        npcTypeIds: [firstTypeId, secondTypeId],
    });
    const manager = new EncounterManager(registry);
    const deliveredThresholds: string[] = [];
    manager.onThresholdCrossed((event) => deliveredThresholds.push(event.thresholdId));
    const first = new NpcState(
        501,
        firstTypeId,
        1,
        -1,
        -1,
        32,
        { x: 3200, y: 3200, level: 0 },
        { maxHitpoints: 100 },
    );
    const runtime = manager.ensureForNpc(first);
    assert.ok(runtime);
    const generationBeforeTransition = runtime.generation;
    runtime.ownNpc(777);
    runtime.ownTask("form-transition-task");
    runtime.ownHazard("form-transition-hazard");
    runtime.ownLocation("form-transition-location");
    first.applyDamage(60);
    assert.equal(runtime.healthCurrent, 40);
    assert.deepEqual(deliveredThresholds, ["three-quarters"]);

    const replacement = new NpcState(
        502,
        secondTypeId,
        1,
        -1,
        -1,
        32,
        { x: 3200, y: 3200, level: 0 },
        { maxHitpoints: 100 },
    );
    const automaticReplacementRuntime = manager.ensureForNpc(replacement);
    assert.ok(automaticReplacementRuntime);
    assert.equal(automaticReplacementRuntime.healthCurrent, 100);

    assert.equal(manager.transitionFormIfCompatible(first.id, replacement), true);
    assert.equal(automaticReplacementRuntime.lifecycle, "disposed");
    assert.equal(replacement.getHitpoints(), 40);
    assert.equal(runtime.currentNpcRuntimeId, replacement.id);
    assert.equal(runtime.healthCurrent, 40, "preserved damage must not be applied twice");
    assert.equal(
        runtime.generation,
        generationBeforeTransition,
        "changing forms must not invalidate same-life encounter work",
    );
    const resourcesAfterTransition = runtime.snapshotOwnedResources();
    assert.deepEqual(
        [...resourcesAfterTransition.npcRuntimeIds].sort((a, b) => a - b),
        [replacement.id, 777].sort((a, b) => a - b),
    );
    assert.deepEqual([...resourcesAfterTransition.taskIds], ["form-transition-task"]);
    assert.deepEqual([...resourcesAfterTransition.hazardIds], ["form-transition-hazard"]);
    assert.deepEqual([...resourcesAfterTransition.locationIds], ["form-transition-location"]);
    assert.deepEqual(
        deliveredThresholds,
        ["three-quarters"],
        "aligning a compatible form must not emit a temporary runtime threshold",
    );

    first.applyDamage(5);
    assert.equal(runtime.healthCurrent, 40, "the retired form listener must be detached");
    replacement.applyDamage(5);
    assert.equal(runtime.healthCurrent, 35);

    replacement.applyDamage(35);
    const deadReplacement = new NpcState(
        503,
        firstTypeId,
        1,
        -1,
        -1,
        32,
        { x: 3200, y: 3200, level: 0 },
        { maxHitpoints: 100 },
    );
    deadReplacement.applyDamage(100);
    assert.equal(
        manager.transitionFormIfCompatible(replacement.id, deadReplacement),
        true,
    );
    assert.equal(runtime.healthCurrent, 0);
    assert.equal(runtime.lifecycle, "dead");
    assert.equal(
        runtime.planAttack({ tick: 20, targetId: 7, targetDistance: 1 }),
        undefined,
        "a zero-health alternate form must remain unable to attack",
    );
}

function testRespawnCreatesFreshRuntimeAndRearmsPerLifeThresholds(): void {
    const { manager, npc, runtime: firstLife } = createEncounter(81_050);
    applicator.applyNpcHitsplat(npc, HITMARK_DAMAGE, 100, 1);
    assert.equal(firstLife.lifecycle, "dead");

    manager.removeNpc(npc.id);
    assert.equal(firstLife.lifecycle, "disposed");
    npc.resetToSpawn();

    const secondLife = manager.ensureForNpc(npc);
    assert.ok(secondLife);
    assert.notEqual(secondLife.id, firstLife.id);
    assert.equal(secondLife.healthCurrent, 100);
    assert.equal(secondLife.lifecycle, "idle");

    assert.deepEqual(
        secondLife.applyDamage(30).map((event) => event.thresholdId),
        ["three-quarters"],
    );
    secondLife.heal(30);
    assert.deepEqual(
        secondLife.applyDamage(30).map((event) => event.thresholdId),
        [],
        "healing must not re-arm a once-per-life threshold",
    );
    secondLife.resetHealth();
    assert.deepEqual(
        secondLife.applyDamage(30).map((event) => event.thresholdId),
        ["three-quarters"],
        "a true reset must re-arm thresholds for the next life",
    );
}

testOrdinaryDamageHealingAndRegenerationStayAligned();
testPoisonAndVenomDirectHitsUseActualPostClampHealth();
testPoisonAndVenomStatusTicksUseTheSameObserver();
testPreventedLethalStatusHitPublishesOnlyItsCommittedHealth();
testAuthoritativeHealRevivesEncounterPlanningBeforeDespawn();
testThresholdEventsDeliverOncePerLifeAndRearmOnReset();
testResetCleansOwnedResourcesButPreservesTheBoss();
testFormTransitionPreservesSharedHealthExactlyOnce();
testRespawnCreatesFreshRuntimeAndRearmsPerLifeThresholds();

console.log("encounter health synchronization tests passed");
