import assert from "node:assert/strict";

import { SkillId } from "@august/osrs-engine/skill/skills";
import { defaultInterruptionRegistry } from "@server/game/actions/ActionInterruptionRegistry";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import {
    MechanicRegistry,
    damageCap,
    enrageTimer,
    freezeBindHit,
    hasEquipmentRequirements,
    interruptibleHeal,
    invulnerabilityWindow,
    knockback,
    prayerDrainHit,
    spawnAdds,
    statDrainHit,
    stunHit,
} from "@server/game/encounters/mechanics";
import type { EncounterDefinition } from "@server/game/encounters/EncounterTypes";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

const definition: EncounterDefinition = {
    id: "mechanics-contract",
    npcTypeIds: [90_000],
    maxHealth: 100,
    attacks: [{ id: "melee", type: AttackType.Melee, rangeTiles: 1, speedTicks: 4 }],
};

function createRuntime(): EncounterRuntime {
    return new EncounterRuntime("mechanics-contract:1", definition, 10, 90_000, 100, 1234);
}

function testBuiltInMechanicRegistration(): void {
    const builtInIds = [
        "damage-cap",
        "delayed-impact",
        "enrage-timer",
        "freeze-bind-hit",
        "interruptible-heal",
        "invulnerability-window",
        "knockback",
        "prayer-drain-hit",
        "spawn-adds",
        "spawn-floor-hazard",
        "stat-drain-hit",
        "stun-hit",
    ] as const;

    for (const id of builtInIds) {
        assert.equal(
            typeof MechanicRegistry.shared.get(id),
            "function",
            `the documented built-in mechanic '${id}' must be registered by the barrel import`,
        );
    }
}

function createEncounterHarness() {
    let hitpoints = 40;
    let nextTaskId = 1;
    const tasks = new Map<number, { delay: number; callback: (tick: number) => void }>();
    const cancelled: number[] = [];
    const spotAnimations: number[] = [];
    const stuns: number[] = [];
    const teleports: Array<{ x: number; y: number; level: number }> = [];
    const forcedMovements: unknown[] = [];
    const source = {
        id: 10,
        typeId: 90_000,
        tileX: 5,
        tileY: 5,
        level: 0,
        worldViewId: 7,
        incomingPlayerDamageCap: 77,
        incomingPlayerDamageMultiplier: 0.75,
        isUnattackable: false,
        getHitpoints: () => hitpoints,
        heal: (amount: number) => {
            hitpoints += amount;
        },
    };
    const services = {
        combat: {
            getNpc: (id: number) => (id === source.id ? source : undefined),
            stunPlayer: (_player: PlayerState, ticks: number) => stuns.push(ticks),
        },
        scheduler: {
            after: (delay: number, callback: (tick: number) => void) => {
                const id = nextTaskId++;
                tasks.set(id, { delay, callback });
                return id;
            },
            cancel: (id: number) => {
                cancelled.push(id);
                tasks.delete(id);
            },
        },
        npc: {
            queueNpcSpotAnim: (_npc: unknown, graphicId: number) => spotAnimations.push(graphicId),
        },
        movement: {
            getPathService: () => ({
                findPathSteps: ({ to }: { to: { x: number; y: number } }) => ({
                    ok: true,
                    steps: [{ x: to.x, y: to.y }],
                }),
            }),
            teleportPlayer: (_player: PlayerState, x: number, y: number, level: number) => {
                teleports.push({ x, y, level });
            },
            queueForcedMovement: (_player: PlayerState, movement: unknown) => {
                forcedMovements.push(movement);
            },
        },
        system: { getCurrentTick: () => 50 },
    } as unknown as ScriptServices;

    const runNextTask = (tick: number): number => {
        const next = [...tasks.entries()].sort(([left], [right]) => left - right)[0];
        assert.ok(next, "expected a scheduled mechanic task");
        tasks.delete(next[0]);
        next[1].callback(tick);
        return next[1].delay;
    };

    return {
        services,
        source,
        cancelled,
        spotAnimations,
        stuns,
        teleports,
        forcedMovements,
        runNextTask,
        getHitpoints: () => hitpoints,
    };
}

function testStateOverrideLifecycle(): void {
    const runtime = createRuntime();
    const harness = createEncounterHarness();

    const cap = damageCap(runtime, harness.services, { maximumHit: 12 });
    const shield = invulnerabilityWindow(runtime, harness.services, { blockTargeting: true });
    assert.equal(cap.isActive, true);
    assert.equal(shield.isActive, true);
    assert.equal(harness.source.incomingPlayerDamageCap, 12);
    assert.equal(harness.source.incomingPlayerDamageMultiplier, 0);
    assert.equal(harness.source.isUnattackable, true);

    runtime.resetHealth();
    assert.equal(cap.isActive, false);
    assert.equal(shield.isActive, false);
    assert.equal(harness.source.incomingPlayerDamageCap, 77);
    assert.equal(harness.source.incomingPlayerDamageMultiplier, 0.75);
    assert.equal(harness.source.isUnattackable, false);
}

function testScheduledMechanicLifecycle(): void {
    const runtime = createRuntime();
    const harness = createEncounterHarness();
    let enragedAt: number | undefined;

    const enrage = enrageTimer(runtime, harness.services, {
        delayTicks: 6,
        onEnrage: ({ tick }) => {
            enragedAt = tick;
        },
    });
    assert.equal(harness.runNextTask(106), 6);
    assert.equal(enragedAt, 106);
    assert.equal(enrage.isActive, false, "an enrage callback is one-shot");

    const heal = interruptibleHeal(runtime, harness.services, {
        amount: 5,
        intervalTicks: 2,
        durationTicks: 4,
        graphicId: 84,
    });
    assert.equal(harness.runNextTask(108), 2);
    assert.equal(harness.getHitpoints(), 45);
    assert.equal(heal.isActive, true);
    assert.equal(harness.runNextTask(110), 2);
    assert.equal(harness.getHitpoints(), 50);
    assert.equal(heal.isActive, false);
    assert.deepEqual(harness.spotAnimations, [84, 84]);

    const uneven = interruptibleHeal(runtime, harness.services, {
        amount: 7,
        intervalTicks: 3,
        durationTicks: 5,
        graphicId: 85,
    });
    assert.equal(harness.runNextTask(113), 3);
    assert.equal(harness.getHitpoints(), 57);
    assert.equal(uneven.isActive, true);
    assert.equal(harness.runNextTask(115), 2, "the final expiry task lands exactly on duration");
    assert.equal(harness.getHitpoints(), 57, "a partial trailing interval must not grant another heal");
    assert.equal(uneven.isActive, false);
    assert.deepEqual(harness.spotAnimations, [84, 84, 85]);
}

function createSpawnAddsHarness() {
    const source = {
        id: 10, typeId: 90_000, tileX: 5, tileY: 5, level: 0, worldViewId: 7,
        getHitpoints: () => 100,
    } as NpcState;
    const spawned = { id: 20, typeId: 90_001 } as NpcState;
    let liveAdd: NpcState | undefined = spawned;
    let expiry: ((tick: number) => void) | undefined;
    const removed: number[] = [];
    const services = {
        combat: {
            getNpc: (id: number) => id === source.id ? source : id === spawned.id ? liveAdd : undefined,
        },
        scheduler: {
            after: (_delay: number, callback: (tick: number) => void) => {
                expiry = callback;
                return 41;
            },
            cancel: () => undefined,
        },
        npc: {
            spawnNpc: () => spawned,
            removeNpc: (id: number) => {
                removed.push(id);
                if (id === spawned.id) liveAdd = undefined;
                return true;
            },
            engageCombat: () => undefined,
        },
    } as unknown as ScriptServices;
    return {
        services,
        source,
        spawned,
        removed,
        runExpiry: () => {
            assert.ok(expiry);
            expiry(5);
        },
        replaceLiveAdd: () => {
            liveAdd = { id: spawned.id, typeId: 99_999 } as NpcState;
        },
    };
}

function testSpawnAddsReleasesNaturalAndCancelledOwnership(): void {
    const expiredRuntime = createRuntime();
    const expiredHarness = createSpawnAddsHarness();
    const expiring = spawnAdds(expiredRuntime, expiredHarness.services, {
        npcTypeId: 90_001,
        count: 1,
        lifetimeTicks: 5,
    });
    assert.equal(expiring.isActive, true);
    assert.equal(expiredRuntime.snapshotOwnedResources().npcRuntimeIds.has(20), true);
    expiredHarness.runExpiry();
    assert.equal(expiring.isActive, false);
    assert.deepEqual(expiredHarness.removed, [20]);
    assert.equal(expiredRuntime.snapshotOwnedResources().npcRuntimeIds.has(20), false);

    const cancelledRuntime = createRuntime();
    const cancelledHarness = createSpawnAddsHarness();
    const cancelled = spawnAdds(cancelledRuntime, cancelledHarness.services, {
        npcTypeId: 90_001,
        count: 1,
    });
    cancelled.cancel();
    assert.deepEqual(cancelledHarness.removed, [20]);
    assert.equal(cancelledRuntime.snapshotOwnedResources().npcRuntimeIds.has(20), false);

    const reusedRuntime = createRuntime();
    const reusedHarness = createSpawnAddsHarness();
    const reused = spawnAdds(reusedRuntime, reusedHarness.services, {
        npcTypeId: 90_001,
        count: 1,
    });
    // Mirrors EncounterManager's physical-removal notification before an id
    // becomes eligible for reuse by another NPC.
    reusedRuntime.releaseNpc(20);
    reusedHarness.replaceLiveAdd();
    reused.cancel();
    assert.deepEqual(
        reusedHarness.removed,
        [],
        "cleanup must not remove a different NPC which reused the spawned add's runtime id",
    );
    assert.equal(reusedRuntime.snapshotOwnedResources().npcRuntimeIds.has(20), false);
}

function createPlayerHarness() {
    const levels = new Map<SkillId, { baseLevel: number; boost: number }>([
        [SkillId.Attack, { baseLevel: 50, boost: 0 }],
        [SkillId.Prayer, { baseLevel: 40, boost: 0 }],
    ]);
    const freezes: Array<{ ticks: number; tick: number }> = [];
    const interactions: Array<{ type: string; id: number }> = [];
    const player = {
        id: 20,
        tileX: 6,
        tileY: 6,
        level: 0,
        worldViewId: 7,
        skillSystem: {
            getSkill: (id: SkillId) => levels.get(id) ?? { baseLevel: 1, boost: 0 },
            setSkillBoost: (id: SkillId, level: number) => {
                const skill = levels.get(id) ?? { baseLevel: 1, boost: 0 };
                skill.boost = level - skill.baseLevel;
                levels.set(id, skill);
            },
        },
        applyFreeze: (ticks: number, tick: number) => {
            freezes.push({ ticks, tick });
            return true;
        },
        setCombatTarget: () => {},
        setInteraction: (type: string, id: number) => interactions.push({ type, id }),
    } as unknown as PlayerState;
    return { player, levels, freezes, interactions };
}

function testDirectPlayerEffectsAndRequirements(): void {
    const runtime = createRuntime();
    const harness = createEncounterHarness();
    const playerHarness = createPlayerHarness();

    statDrainHit(runtime, harness.services, {
        target: playerHarness.player,
        drains: [{ skillId: SkillId.Attack, amount: 7, minimumLevel: 1 }],
    });
    prayerDrainHit(runtime, harness.services, {
        target: playerHarness.player,
        amount: 3,
        fraction: 0.25,
    });
    freezeBindHit(runtime, harness.services, { target: playerHarness.player, ticks: 8 });
    stunHit(runtime, harness.services, { target: playerHarness.player, ticks: 3 });
    knockback(runtime, harness.services, {
        target: playerHarness.player,
        distance: 2,
        stunTicks: 1,
        preserveNpcTarget: true,
    });
    const cardinalPlayer = createPlayerHarness().player;
    cardinalPlayer.tileX = 5;
    cardinalPlayer.tileY = 6;
    knockback(runtime, harness.services, {
        target: cardinalPlayer,
        distance: 2,
    });

    assert.equal(playerHarness.levels.get(SkillId.Attack)?.boost, -7);
    assert.equal(playerHarness.levels.get(SkillId.Prayer)?.boost, -13);
    assert.deepEqual(playerHarness.freezes, [{ ticks: 8, tick: 50 }]);
    assert.deepEqual(harness.stuns, [3, 1]);
    assert.deepEqual(harness.teleports, [
        { x: 8, y: 8, level: 0 },
        { x: 5, y: 8, level: 0 },
    ], "cardinal knockback must not invent movement on the aligned axis");
    assert.equal(harness.forcedMovements.length, 2);
    assert.deepEqual(playerHarness.interactions, [{ type: "npc", id: 10 }]);

    const requirementServices = {
        equipment: { getEquipArray: () => [100, 200] },
        inventory: { playerHasItem: (_player: PlayerState, itemId: number) => itemId === 300 },
    } as unknown as ScriptServices;
    assert.equal(
        hasEquipmentRequirements(playerHarness.player, requirementServices, [
            { itemId: 100, location: "equipped" },
            { itemId: 300, location: "inventory" },
            { itemId: 200 },
        ]),
        true,
    );
    assert.equal(
        hasEquipmentRequirements(playerHarness.player, requirementServices, [
            { itemId: 300, location: "equipped" },
        ]),
        false,
    );
}

function testSkillingActionInterruptionContract(): void {
    const scheduledSkillActions = [
        "skill.bolt_enchant",
        "skill.campfire",
        "skill.cook",
        "skill.craft",
        "skill.firemaking",
        "skill.fish",
        "skill.flax",
        "skill.fletch",
        "skill.mine",
        "skill.picklock",
        "skill.pickpocket",
        "skill.sinew",
        "skill.smelt",
        "skill.smith",
        "skill.spin",
        "skill.tan",
        "skill.woodcut",
    ] as const;

    for (const kind of scheduledSkillActions) {
        assert.equal(
            defaultInterruptionRegistry.isInterruptible(kind),
            true,
            `${kind} must stop on player movement or a new interaction`,
        );
    }
    assert.equal(defaultInterruptionRegistry.isInterruptible("inventory.food"), false);
    assert.equal(defaultInterruptionRegistry.isInterruptible("combat.attack"), false);
    assert.equal(defaultInterruptionRegistry.isInterruptible("custom", ["skill.surface"]), true);
}

testBuiltInMechanicRegistration();
testStateOverrideLifecycle();
testScheduledMechanicLifecycle();
testSpawnAddsReleasesNaturalAndCancelledOwnership();
testDirectPlayerEffectsAndRequirements();
testSkillingActionInterruptionContract();

console.log("mechanics integration contract tests passed");
