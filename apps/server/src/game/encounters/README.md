# Encounter framework

This package is the reusable orchestration layer for bosses and scripted NPC encounters. It chooses
attacks and owns encounter resources; the combat engine remains authoritative for reach, pathing,
attack timing, rolls, hits, retaliation, and death.

## Minimal authoring example

`defineBoss` validates a boss at module load. `attack.melee`, `attack.ranged`, `attack.magic`, and
`phase.atHealth` are logical shorthand over the full encounter types. `defineBossMechanics` gives
named, typed bindings to the reusable factories; bindings run only when encounter content invokes
them from the relevant attack, threshold, or special callback.

```ts
import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import {
    attack,
    defineBoss,
    defineBossMechanics,
    mechanic,
    phase,
    registerOwnedEncounter,
    type EncounterRuntime,
} from "@server/game/encounters";
import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

type BoulderEvent = { readonly attackId: "boulder"; readonly target: PlayerState };

const mechanics = defineBossMechanics({
    boulderImpact: mechanic.delayedImpact<BoulderEvent>({
        id: "example-boss:boulder-impact",
        reentrancy: "stack",
        trigger: mechanic.everyAttacks(3, { attackIds: ["boulder"] }),
        params: ({ runtime, input }) => ({
            target: input.target,
            delayTicks: 3,
            projectile: { projectileId: 456 },
            onImpact: ({ source, target, tick, services }) => {
                const damage = 12 + runtime.rng.nextInt(9);
                services.combat.applyNpcDamageToPlayer(
                    source, target, HITMARK_DAMAGE, damage, tick,
                );
            },
        }),
    }),
});

const exampleBoss = defineBoss({
    id: "example-boss",
    npcTypeIds: [1000, 1001], // alternate forms share one encounter identity
    maxHealth: 600,
    attacks: [
        attack.melee({ id: "claw", maxHit: 18, animation: "melee" }),
        attack.ranged({ id: "boulder", maxHit: 24, animation: "ranged" }),
    ],
    phases: [phase.atHealth("enraged", 50, ["boulder"])],
    mechanics,
});

export function registerExampleBoss(registry: IScriptRegistry): void {
    registerOwnedEncounter(registry, exampleBoss);
}

export function afterExampleAttack(
    runtime: EncounterRuntime,
    services: ScriptServices,
    target: PlayerState,
): void {
    mechanics.boulderImpact.run(runtime, services, { attackId: "boulder", target });
}
```

The registry validates duplicate NPC types, attack/phase/mechanic ids, and unknown references.
Attack selection is seeded and deterministic, supports priority and weights, and observes distance,
cooldown, phase allow-lists, and custom conditions. `rangeTiles` controls hit reach;
`preferredDistance` independently controls movement intent. Prefer named `animation` roles from
`npc-combat-defs.json`; use `animationId` only for a one-off sequence, never alongside `animation`.

## Mechanic and registry lifecycle

- Content definitions use `registerOwnedEncounter`; provider rollback, reset, or hot reload removes
  the exact definition. Registry removal and `clear()` immediately make `EncounterManager` dispose
  runtimes bound to that object, while a stale disposer cannot remove a replacement definition.
- Every resource created through a framework factory/timeline—or explicitly attached with the runtime
  ownership API—belongs to its `EncounterRuntime`. Health reset and disposal cancel active handles and
  clear those owned resources; death blocks new bindings and guarded callbacks discard invalid work.
  Form transition resets attack/mechanic cadence while preserving the shared health pool. Content that
  schedules work directly remains responsible for attaching or cancelling that work.
- Every repeatable binding declares `replace`, `ignore`, or `stack`. `mechanic.everyAttacks` counts
  matching events per binding and runtime, ignores inactive runtimes, and resets for a new life/form.
- Built-in bindings are `floorHazard`, `spawnAdds`, `interruptibleHeal`, `enrage`,
  `invulnerability`, `damageCap`, `delayedImpact`, `statDrain`, `prayerDrain`, `freeze`, `stun`, and
  `knockback`. Use `mechanic.custom` for owned choreography and `mechanic.registered` for a reusable
  extension. Natural completion releases registry tracking immediately; provider unregistration
  cancels remaining handles created by that exact extension. Replacement factories resolve at run time.
- `delayedImpact` optionally launches a projectile, then rechecks runtime life, exact NPC identity,
  source health, world view, plane, and an encounter-specific target predicate at impact time. Its
  callback may evaluate prayer and damage at impact through the authoritative combat service.

Immunities are resolved when the NPC spawns: base NPC data, then the encounter profile, then an
explicit transient-spawn override. Shared poison, venom, disease, freeze/bind, stat-drain, burn,
stun, and knockback paths enforce that profile.

## Rooms and supporting helpers

`defineBossRoom` owns the repeated solo/party create, join, peek, leave, template, destination, exit,
grave, NPC/location population, messages, and door registration flow. `defineGwdAltar` adds a
room-scoped, per-player prayer recharge cooldown. Both expose `.register(registry)` so their handlers
share the provider lifetime. Stronghold traversal, access/killcount policy, encounter combat, and
rewards remain in content.

Bosses spawned after room creation call `services.instances.attachNpc(instanceId, npc)`. The
instance manager then owns their visibility and cleanup, mounts the native boss HUD for all members,
and safely switches that HUD when a sequential encounter (such as the Moons) changes bosses.

Live `defineBoss` adopters are Araxxor, Scurrius, Kree'arra, General Graardor, Commander Zilyana,
K'ril Tsutsaroth, Nex, all three Moons, their encounter minions/forms, Giant Mole, the Dagannoth
Kings, Zulrah, and all six Barrows brothers. Scurrius uses add, floor-hazard, and delayed-impact
bindings; Moons uses invulnerability and every-three-attacks bindings. All four GWD modules use
`defineBossRoom` and `defineGwdAltar`.

The framework intentionally leaves fight-specific choreography in callbacks. Current exceptions
include Araxxor egg/add/corpse flow, Scurrius food movement and rewards, Nex mage-gate sequencing,
Moons jaguar/clone/storm/brazier sequences, and Barrows run/reward/on-hit rules. Mole burrowing,
complete Zulrah cloud/snakeling/form choreography, and later Nex phase specials require authoritative
behavior/data and are not claimed as implemented. See
[boss mechanic coverage](./mechanics/boss-mechanic-coverage.md) for the full mapping.
