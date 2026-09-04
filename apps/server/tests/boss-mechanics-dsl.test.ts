import assert from "node:assert/strict";

import { registerBossCombatEncounters } from "@server/content/gamemodes/vanilla/combat/BossCombatScript";
import { registerBarrowsEncounters } from "@server/content/gamemodes/vanilla/scripts/content/barrows";
import { AttackType } from "@server/game/combat/AttackType";
import { attack, defineBoss, phase } from "@server/game/encounters/BossDefinition";
import { defineBossMechanics, mechanic } from "@server/game/encounters/BossMechanics";
import { EncounterManager } from "@server/game/encounters/EncounterManager";
import { EncounterRegistry, registerOwnedEncounter } from "@server/game/encounters/EncounterRegistry";
import { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import {
    MechanicRegistry,
    createMechanicHandle,
    createInactiveMechanicHandle,
    delayedImpact,
    registerOwnedMechanic,
} from "@server/game/encounters/mechanics";
import type { EncounterDefinition } from "@server/game/encounters/EncounterTypes";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

function baseDefinition(id: string, npcTypeIds: readonly number[] = [91_000]): EncounterDefinition {
    return {
        id,
        npcTypeIds,
        maxHealth: 100,
        attacks: [attack.melee({ id: "melee", maxHit: 10 })],
        phases: [phase.atHealth("normal", 100, ["melee"])],
    };
}

function runtimeFor(
    definition: EncounterDefinition = baseDefinition("dsl-runtime", [91_000, 91_001]),
    seed = 44,
): EncounterRuntime {
    return new EncounterRuntime(`${definition.id}:1`, definition, 10, definition.npcTypeIds[0]!, 100, seed);
}

function cleanupOwner(): { readonly owner: IScriptRegistry; readonly cleanups: Array<() => void> } {
    const cleanups: Array<() => void> = [];
    const owner = {
        registerCleanup: (cleanup: () => void) => {
            cleanups.push(cleanup);
            return { ok: true };
        },
    } as unknown as IScriptRegistry;
    return { owner, cleanups };
}

function disposeInReverse(cleanups: Array<() => void>): void {
    for (const cleanup of cleanups.reverse()) cleanup();
}

function testDefinitionHelpersAndValidation(): void {
    const melee = attack.melee({ maxHit: 12 });
    const magic = attack.magic({ id: "spell", maxHit: 20 });
    assert.deepEqual(
        { id: melee.id, range: melee.rangeTiles, preferred: melee.preferredDistance, maximum: melee.maxDistance, speed: melee.speedTicks },
        { id: "melee", range: 1, preferred: 1, maximum: 1, speed: 4 },
    );
    assert.equal(magic.type, AttackType.Magic);
    assert.equal(magic.rangeTiles, 10);

    const duplicateMechanic = () => mechanic.custom({ id: "duplicate", execute: () => undefined });
    assert.throws(
        () => defineBossMechanics({ first: duplicateMechanic(), second: duplicateMechanic() }),
        /must be unique/,
    );

    const unknownAttack = defineBossMechanics({
        pulse: mechanic.custom<{ attackId: string }>({
            id: "unknown-attack",
            trigger: mechanic.everyAttacks(2, { attackIds: ["missing"] }),
            execute: () => undefined,
        }),
    });
    assert.throws(
        () => defineBoss({ ...baseDefinition("unknown-attack"), mechanics: unknownAttack }),
        /unknown attack 'missing'/,
    );

    const unknownPhase = defineBossMechanics({
        pulse: mechanic.custom<{ phaseId: string }>({
            id: "unknown-phase",
            trigger: mechanic.everyAttacks(2, { phaseIds: ["missing"] }),
            execute: () => undefined,
        }),
    });
    assert.throws(
        () => defineBoss({ ...baseDefinition("unknown-phase"), mechanics: unknownPhase }),
        /unknown phase 'missing'/,
    );
    assert.throws(() => mechanic.everyAttacks(0), /positive integer/);
    assert.throws(() => mechanic.everyAttacks(2, { offset: 2 }), /between zero/);

    assert.throws(
        () => defineBoss({ ...baseDefinition("bad-npc"), npcTypeIds: [0] }),
        /positive integers/,
    );
    assert.throws(
        () => defineBoss({
            ...baseDefinition("fractional-range"),
            attacks: [attack.melee({ rangeTiles: 1.5 })],
        }),
        /positive integer range and speed/,
    );
    assert.throws(
        () => defineBoss({
            ...baseDefinition("infinite-speed"),
            attacks: [attack.melee({ speedTicks: Number.POSITIVE_INFINITY })],
        }),
        /positive integer range and speed/,
    );
    assert.throws(
        () => defineBoss({
            ...baseDefinition("invalid-weight"),
            attacks: [attack.melee({ weight: Number.NaN })],
        }),
        /weight must be a finite non-negative number/,
    );
    assert.throws(
        () => defineBoss({
            ...baseDefinition("fractional-cooldown"),
            attacks: [attack.melee({ cooldownTicks: 1.5 })],
        }),
        /cooldown must be a non-negative integer/,
    );
    assert.throws(
        () => defineBoss({
            ...baseDefinition("infinite-priority"),
            attacks: [attack.melee({ priority: Number.POSITIVE_INFINITY })],
        }),
        /priority must be a finite integer/,
    );
    assert.throws(
        () => defineBoss({ ...baseDefinition("empty-phase"), phases: [phase.atHealth(" ", 100)] }),
        /empty phase id/,
    );
    assert.throws(
        () => defineBoss({
            ...baseDefinition("empty-threshold"),
            thresholds: [{ id: " ", atHealthPercent: 50 }],
        }),
        /empty threshold id/,
    );

    const npcTypeIds = [91_002];
    const phaseAttackIds = ["immutable"];
    const effects = { guaranteedHit: true };
    const immutable = defineBoss({
        id: "immutable-definition",
        npcTypeIds,
        attacks: [attack.melee({ id: "immutable", effects })],
        phases: [phase.atHealth("normal", 100, phaseAttackIds)],
    });
    assert.equal(Object.isFrozen(immutable.npcTypeIds), true);
    assert.equal(Object.isFrozen(immutable.attacks), true);
    assert.equal(Object.isFrozen(immutable.attacks[0]?.effects), true);
    assert.equal(Object.isFrozen(immutable.phases?.[0]?.attackIds), true);
    assert.throws(() => (npcTypeIds as number[]).push(91_003), TypeError);
    assert.throws(() => (phaseAttackIds as string[]).push("other"), TypeError);
    (effects as { guaranteedHit: boolean }).guaranteedHit = false;
    assert.equal(effects.guaranteedHit, true, "frozen nested effects cannot drift after validation");
}

function testEveryAttacksRuntimeIsolationAndReset(): void {
    const rolls: number[] = [];
    const mechanics = defineBossMechanics({
        pulse: mechanic.custom<{ attackId: string }>({
            id: "three-hit-pulse",
            trigger: mechanic.everyAttacks(3, { attackIds: ["melee"] }),
            execute: ({ runtime }) => {
                rolls.push(runtime.rng.nextInt(10_000));
            },
        }),
    });
    const definition = defineBoss({
        ...baseDefinition("cadence", [91_010, 91_011]),
        mechanics,
    });
    const first = runtimeFor(definition, 123);
    const second = new EncounterRuntime("cadence:2", definition, 20, 91_010, 100, 123);
    const services = {} as ScriptServices;

    assert.equal(mechanics.pulse.run(first, services, { attackId: "other" }).triggered, false);
    assert.equal(mechanics.pulse.run(first, services, { attackId: "melee" }).eventCount, 1);
    assert.equal(mechanics.pulse.run(first, services, { attackId: "melee" }).eventCount, 2);
    assert.equal(mechanics.pulse.run(first, services, { attackId: "melee" }).triggered, true);
    assert.equal(mechanics.pulse.run(second, services, { attackId: "melee" }).eventCount, 1);
    assert.equal(rolls.length, 1, "a separate runtime must start its own cadence");

    mechanics.pulse.reset(second);
    assert.equal(mechanics.pulse.run(second, services, { attackId: "melee" }).eventCount, 1);
    second.resetHealth();
    assert.equal(mechanics.pulse.run(second, services, { attackId: "melee" }).eventCount, 1);
    mechanics.pulse.run(second, services, { attackId: "melee" });
    second.transitionForm(21, 91_011);
    assert.equal(mechanics.pulse.run(second, services, { attackId: "melee" }).eventCount, 1);

    first.applyDamage(100);
    assert.equal(mechanics.pulse.run(first, services, { attackId: "melee" }).triggered, false);
    second.dispose();
    assert.equal(mechanics.pulse.run(second, services, { attackId: "melee" }).triggered, false);

    const deterministic = runtimeFor(definition, 123);
    mechanics.pulse.run(deterministic, services, { attackId: "melee" });
    mechanics.pulse.run(deterministic, services, { attackId: "melee" });
    mechanics.pulse.run(deterministic, services, { attackId: "melee" });
    assert.equal(rolls[1], rolls[0], "mechanic randomness must come from the encounter seed");
}

function testDynamicRegisteredMechanicResolution(): void {
    const registry = new MechanicRegistry();
    const versions: number[] = [];
    const unregisterFirst = registry.register<number>("extension", (_runtime, _services, version) => {
        versions.push(version);
        return createInactiveMechanicHandle(`extension:${version}`);
    });
    const binding = mechanic.registered<void, number>(
        "extension",
        { id: "extension-binding", params: 1 },
        registry,
    );
    const definition = defineBoss({
        ...baseDefinition("custom-registry"),
        mechanics: defineBossMechanics({ extension: binding }),
    });
    const runtime = runtimeFor(definition);

    binding.run(runtime, {} as ScriptServices, undefined);
    unregisterFirst();
    assert.equal(binding.run(runtime, {} as ScriptServices, undefined).handle?.isActive, false);
    const unregisterSecond = registry.register<number>("extension", (_nextRuntime, _services, version) => {
        versions.push(version * 10);
        return createInactiveMechanicHandle(`replacement:${version}`);
    });
    binding.run(runtime, {} as ScriptServices, undefined);
    assert.deepEqual(versions, [1, 10], "the binding must resolve a replacement rather than retain a stale factory");
    unregisterFirst();
    assert.equal(registry.has("extension"), true, "a stale disposer must not remove a replacement");
    unregisterSecond();
    assert.throws(
        () => mechanic.registered("missing", { id: "missing", params: {} }, registry),
        /Unknown encounter mechanic/,
    );
}

function testOwnedMechanicUnregistrationCancelsHandles(): void {
    const owned = cleanupOwner();
    const mechanicId = "test-owned-active-extension";
    let firstCancellations = 0;
    registerOwnedMechanic<void>(owned.owner, mechanicId, () =>
        createMechanicHandle("first-active-handle", () => {
            firstCancellations += 1;
        }),
    );
    const binding = mechanic.registered<void, void>(
        mechanicId,
        { id: "owned-active-binding", params: undefined },
    );
    const activeRuntime = runtimeFor(baseDefinition("owned-mechanic-runtime", [91_022]));
    const firstHandle = binding.run(activeRuntime, {} as ScriptServices, undefined).handle;
    assert.equal(firstHandle?.isActive, true);

    const staleDisposer = owned.cleanups[0]!;
    staleDisposer();
    assert.equal(firstHandle?.isActive, false);
    assert.equal(firstCancellations, 1);

    let replacementCancellations = 0;
    const unregisterReplacement = MechanicRegistry.shared.register<void>(mechanicId, () =>
        createMechanicHandle("replacement-active-handle", () => {
            replacementCancellations += 1;
        }),
    );
    const replacementHandle = binding.run(
        activeRuntime,
        {} as ScriptServices,
        undefined,
    ).handle;
    assert.equal(replacementHandle?.isActive, true);
    staleDisposer();
    assert.equal(
        replacementHandle?.isActive,
        true,
        "a stale disposer must not cancel handles from the replacement registration",
    );

    unregisterReplacement();
    assert.equal(replacementHandle?.isActive, false);
    assert.equal(replacementCancellations, 1);
}

function testCompletedRegisteredMechanicReleasesTracking(): void {
    const registry = new MechanicRegistry();
    let sourceHandle = createInactiveMechanicHandle("not-started");
    const unregister = registry.register<void>("naturally-completing", () => {
        sourceHandle = createMechanicHandle("naturally-completing-handle", () => undefined);
        return sourceHandle;
    });
    const encounter = runtimeFor(baseDefinition("natural-completion-runtime", [91_023]));
    const returned = registry.run("naturally-completing", encounter, {} as ScriptServices, undefined);
    const registrations = (
        registry as unknown as {
            mechanics: Map<string, { activeHandles: Set<unknown> }>;
        }
    ).mechanics;
    assert.equal(registrations.get("naturally-completing")?.activeHandles.size, 1);

    sourceHandle.cancel();
    assert.equal(returned.isActive, false);
    assert.equal(
        registrations.get("naturally-completing")?.activeHandles.size,
        0,
        "natural source completion must release registry tracking without another run/unload",
    );
    unregister();
}

function testOwnedEncounterRegistrationAndLegacyPorts(): void {
    const owned = cleanupOwner();
    const definition = defineBoss(baseDefinition("owned-definition", [91_020]));
    registerOwnedEncounter(owned.owner, definition);
    assert.strictEqual(EncounterRegistry.shared.get(definition.id), definition);
    disposeInReverse(owned.cleanups);
    assert.equal(EncounterRegistry.shared.get(definition.id), undefined);

    const rollbackId = "owned-registration-rollback";
    assert.throws(
        () => registerOwnedEncounter(
            { registerCleanup: () => { throw new Error("owner rejected cleanup"); } },
            defineBoss(baseDefinition(rollbackId, [91_021])),
        ),
        /owner rejected cleanup/,
    );
    assert.equal(EncounterRegistry.shared.get(rollbackId), undefined);

    const legacy = cleanupOwner();
    registerBossCombatEncounters(legacy.owner);
    assert.equal(EncounterRegistry.shared.findByNpcTypeId(5779)?.id, "giant-mole");
    assert.equal(EncounterRegistry.shared.findByNpcTypeId(2265)?.id, "dagannoth-rex");
    assert.equal(EncounterRegistry.shared.findByNpcTypeId(2266)?.id, "dagannoth-prime");
    assert.equal(EncounterRegistry.shared.findByNpcTypeId(2267)?.id, "dagannoth-supreme");
    assert.equal(EncounterRegistry.shared.findByNpcTypeId(2044)?.id, "zulrah");
    assert.equal(EncounterRegistry.shared.findByNpcTypeId(2215), undefined, "Graardor belongs only to Bandos");

    const barrows = cleanupOwner();
    registerBarrowsEncounters(barrows.owner);
    assert.deepEqual(
        [1672, 1673, 1674, 1675, 1676, 1677].map((npcTypeId) => EncounterRegistry.shared.findByNpcTypeId(npcTypeId)?.id),
        ["barrows-ahrim", "barrows-dharok", "barrows-guthan", "barrows-karil", "barrows-torag", "barrows-verac"],
    );

    disposeInReverse(barrows.cleanups);
    disposeInReverse(legacy.cleanups);
    assert.equal(EncounterRegistry.shared.findByNpcTypeId(2042), undefined);
    assert.equal(EncounterRegistry.shared.findByNpcTypeId(1672), undefined);
}

function testLiveRuntimeRejectsStaleDefinition(): void {
    const registry = new EncounterRegistry();
    const firstDefinition = defineBoss(baseDefinition("reloadable", [91_025]));
    const unregisterFirst = registry.register(firstDefinition);
    const manager = new EncounterManager(registry);
    const npc = {
        id: 25,
        typeId: 91_025,
        getMaxHitpoints: () => 100,
        getHitpoints: () => 100,
    } as NpcState;
    const firstRuntime = manager.ensureForNpc(npc);
    assert.ok(firstRuntime);

    unregisterFirst();
    const replacementDefinition = defineBoss({
        ...baseDefinition("reloadable", [91_025]),
        attacks: [attack.magic({ id: "magic", maxHit: 20 })],
        phases: [phase.atHealth("normal", 100, ["magic"])],
    });
    registry.register(replacementDefinition);
    const replacementRuntime = manager.ensureForNpc(npc);
    assert.ok(replacementRuntime);
    assert.notStrictEqual(replacementRuntime, firstRuntime);
    assert.equal(firstRuntime.lifecycle, "disposed");
    assert.strictEqual(replacementRuntime.definition, replacementDefinition);
}

function createDelayedImpactHarness(): {
    readonly services: ScriptServices;
    readonly runtime: EncounterRuntime;
    readonly source: NpcState;
    readonly target: PlayerState;
    readonly tasks: Map<number, (tick: number) => void>;
    readonly cancelled: number[];
    readonly projectiles: unknown[];
    replaceSource(): void;
} {
    const runtime = runtimeFor(baseDefinition("delayed", [91_030]));
    const source = {
        id: 10,
        typeId: 91_030,
        tileX: 5,
        tileY: 5,
        level: 0,
        worldViewId: 7,
        getHitpoints: () => 100,
    } as NpcState;
    const target = {
        id: 20,
        tileX: 10,
        tileY: 5,
        level: 0,
        worldViewId: 7,
    } as PlayerState;
    const tasks = new Map<number, (tick: number) => void>();
    const cancelled: number[] = [];
    const projectiles: unknown[] = [];
    let liveSource: NpcState = source;
    let nextTask = 1;
    const services = {
        combat: { getNpc: (id: number) => id === 10 ? liveSource : undefined },
        projectiles: { launch: (request: unknown) => projectiles.push(request) },
        scheduler: {
            after: (_delay: number, callback: (tick: number) => void) => {
                const id = nextTask++;
                tasks.set(id, callback);
                return id;
            },
            cancel: (id: number) => {
                cancelled.push(id);
                tasks.delete(id);
            },
        },
    } as unknown as ScriptServices;
    return {
        services,
        runtime,
        source,
        target,
        tasks,
        cancelled,
        projectiles,
        replaceSource: () => {
            liveSource = { ...source } as NpcState;
        },
    };
}

function testOwnedDelayedImpact(): void {
    const successful = createDelayedImpactHarness();
    const impactTicks: number[] = [];
    const handle = delayedImpact(successful.runtime, successful.services, {
        target: successful.target,
        delayTicks: 3,
        projectile: { projectileId: 711 },
        onImpact: ({ tick }) => impactTicks.push(tick),
    });
    assert.equal(handle.isActive, true);
    assert.equal(successful.projectiles.length, 1);
    successful.tasks.get(1)?.(103);
    assert.deepEqual(impactTicks, [103]);
    assert.equal(handle.isActive, false);

    const departed = createDelayedImpactHarness();
    let departedHits = 0;
    const departedHandle = delayedImpact(departed.runtime, departed.services, {
        target: departed.target,
        delayTicks: 2,
        onImpact: () => { departedHits += 1; },
    });
    departed.target.worldViewId = 8;
    departed.tasks.get(1)?.(102);
    assert.equal(departedHits, 0);
    assert.equal(departedHandle.isActive, false);

    const replaced = createDelayedImpactHarness();
    let replacedHits = 0;
    delayedImpact(replaced.runtime, replaced.services, {
        target: replaced.target,
        delayTicks: 2,
        onImpact: () => { replacedHits += 1; },
    });
    replaced.replaceSource();
    replaced.tasks.get(1)?.(102);
    assert.equal(replacedHits, 0, "a replacement NPC reusing the runtime id must not inherit the impact");

    const reset = createDelayedImpactHarness();
    const resetHandle = delayedImpact(reset.runtime, reset.services, {
        target: reset.target,
        delayTicks: 2,
        onImpact: () => assert.fail("a reset encounter cannot resolve its old impact"),
    });
    reset.runtime.resetHealth();
    assert.equal(resetHandle.isActive, false);
    assert.deepEqual(reset.cancelled, [1]);
}

testDefinitionHelpersAndValidation();
testEveryAttacksRuntimeIsolationAndReset();
testDynamicRegisteredMechanicResolution();
testOwnedMechanicUnregistrationCancelsHandles();
testCompletedRegisteredMechanicReleasesTracking();
testOwnedEncounterRegistrationAndLegacyPorts();
testLiveRuntimeRejectsStaleDefinition();
testOwnedDelayedImpact();

console.log("boss mechanics DSL tests passed");
