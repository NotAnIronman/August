# Encounter framework

This package is the reusable orchestration layer for bosses and scripted NPC encounters. It does
not replace the combat engine. An encounter chooses an attack before combat routing; the existing
combat engine still handles reach, pathing, attack timing, rolls, hits, retaliation, and death.

## Definition shape

Register one `EncounterDefinition` from a gamemode module with `registerEncounter`. A definition
owns every NPC type used by the fight, movement boundaries, attacks, health phases, and one-shot
health thresholds. Do not add encounter-specific switches to `EncounterManager`.

```ts
registerEncounter({
    id: "example-boss",
    npcTypeIds: [1000, 1001], // alternate forms share one encounter identity
    maxHealth: 600,
    movement: {
        aggressionRadius: 20,
        combatLeashRadius: 30,
        retreatInteractionRange: 40,
    },
    attacks: [
        {
            id: "claw",
            type: AttackType.Melee,
            rangeTiles: 1,
            speedTicks: 4,
            maxDistance: 1,
            animation: "melee",
        },
        {
            id: "boulder",
            type: AttackType.Ranged,
            rangeTiles: 10,
            preferredDistance: 1,
            speedTicks: 5,
            minDistance: 2,
            animation: "ranged",
            projectileId: 456,
        },
    ],
    phases: [{ id: "normal", startsAtHealthPercent: 100 }],
    thresholds: [{ id: "summon-minions", atHealthPercent: 50 }],
});
```

Attack decisions are sticky while an NPC approaches its target. This prevents a boss from choosing
ranged at eight tiles, rerolling melee at one tile, and using routing that no longer matches the
actual attack. Selection is deterministic, supports priority and weighted choices, and observes
distance, cooldown, phase allow-lists, and custom conditions.

`rangeTiles` is the distance at which an attack can land. `preferredDistance` is independent movement
intent: the NPC may perform a valid ranged or magic attack while continuing to approach that distance.
It must be between one tile and the attack's reach. Frozen NPCs can still attack from valid range but
do not approach until movement unlocks.

Use named `animation` roles whenever the sequence already exists in `npc-combat-defs.json`. Style
roles (`melee`, `ranged`, and `magic`) resolve their explicit entry first and then that NPC's generic
`attack`. Indexed specials use `{ special: 0 }` and never fall back. An unresolved explicit role
suppresses the generic humanoid animation rather than risking a broken model; `animationId` remains
an escape hatch for genuinely one-off sequences and cannot be combined with `animation`.

## Runtime ownership

Every spawned minion, scheduled task, temporary hazard, and temporary location must be registered
to its `EncounterRuntime`. Reset and disposal return a complete cleanup snapshot. This is the basis
for safely implementing floor damage, moving waves, shields, and delayed specials without leaving
objects or callbacks behind after a wipe.

Use `selectEncounterTargets` for deterministic current/nearest/farthest/threat/health/random target
selection. Use `scheduleEncounterTimeline` for ordered telegraph, launch, impact, and recovery steps;
it automatically records every scheduled task as encounter-owned cleanup state.

The first foundation intentionally does not execute animation/projectile timelines or redirect live
damage into shared health yet. Those adapters should be added to the authoritative combat hit and
scheduler paths; they should not mutate health from a parallel boss tick loop.
