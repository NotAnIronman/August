# Boss mechanic coverage

This is the authoritative map from reusable boss behavior to its owner. “Shared” means there is one
supported primitive and authoring path; it does not mean every existing fight has been converted or
that missing fight data was inferred.

## Authoring surface

| Concern | Authoring API | Contract |
| --- | --- | --- |
| Boss identity and combat data | `defineBoss`, `attack.melee/ranged/magic/of`, `phase.atHealth` | Validates NPC types, attacks, phases, thresholds, mechanic references, and logical defaults before registration. |
| Named mechanics | `defineBossMechanics`, `mechanic.*` | Provides typed bindings with explicit re-entrancy and optional per-runtime attack cadence. Content still invokes a binding at the real attack/special hook. |
| Provider ownership | `registerOwnedEncounter`, `registerOwnedMechanic` | Unload removes the exact registration. Encounter runtimes and active extension handles are disposed immediately; stale cleanup cannot affect a replacement. |
| Instance-room plumbing | `defineBossRoom` | Reuses solo/party create, join, peek, leave, templates, destinations, exits, graves, population, messages, and door actions. |
| GWD prayer altar | `defineGwdAltar` | Reuses room membership checks and a per-player prayer-recharge cooldown. |

See the [encounter README](../README.md) for a minimal `defineBoss` plus
`defineBossMechanics` example.

## Reusable mechanic factories

| Mechanic | Logical binding / primitive | Lifecycle |
| --- | --- | --- |
| Floor/tile hazard | `mechanic.floorHazard` / `spawnFloorHazard` | Telegraphs, optional markers/projectiles, selected players, repeated pulses, and reset/disposal cleanup. |
| Delayed actor impact | `mechanic.delayedImpact` / `delayedImpact` | Optional projectile; rechecks runtime, exact source NPC, source health, world view, plane, and a content predicate before impact. |
| Adds/minions | `mechanic.spawnAdds` / `spawnAdds` | Formation, aggression, expiry, runtime ownership, and reset/disposal removal. |
| Interruptible healing | `mechanic.interruptibleHeal` / `interruptibleHeal` | Tick healing, optional duration, cancellation, and temporary-state cleanup. |
| Soft/hard enrage | `mechanic.enrage` / `enrageTimer` | One encounter-owned delayed callback. |
| Shield/invulnerability | `mechanic.invulnerability` / `invulnerabilityWindow` | Restores the prior NPC state on expiry or cancellation. |
| Damage cap | `mechanic.damageCap` / `damageCap` | Temporarily installs and later restores the incoming-hit cap used by both hit pipelines. |
| Direct player effects | `mechanic.statDrain/prayerDrain/freeze/stun/knockback` and their primitive functions | Immediate deterministic effects; cardinal knockback preserves the aligned axis. |
| Bespoke owned step | `mechanic.custom` | Keeps encounter-specific choreography behind the same cadence, re-entrancy, and handle ownership contract. |
| Provider extension | `mechanic.registered` | Resolves the current registry factory at run time; removing that exact registration cancels its active handles. |

`mechanic.everyAttacks(n, { attackIds, phaseIds, offset })` counts only matching events. Its counter
is private to one binding and runtime, ignores dead/resetting/disposed runtimes, and resets on a new
life, form transition, or explicit binding reset. A repeatable binding always chooses `replace`,
`ignore`, or `stack`; state overrides normally use `replace`, while independent hazards can stack.
Random choices inside reusable mechanic factories use `runtime.rng`. Bespoke encounter
choreography and reward policy may use their own random source, as called out in the live-adopter
matrix below.

## Universal mechanic ownership

| Behavior | Authoritative system / authoring path |
| --- | --- |
| Overhead prayer, accuracy, poison/venom, hit effects | Core combat; do not duplicate in a mechanic factory. |
| HP phase and one-shot threshold detection | `phase.atHealth`, encounter thresholds, and `EncounterManager.onThresholdCrossed`. |
| Equipment gate | `hasEquipmentRequirements` plus an attack condition or content callback. |
| Target switching/multi-aggro | `selectEncounterTargets`. |
| Ordered bespoke sequence | `scheduleEncounterTimeline` with encounter-owned callbacks. |
| Instanced/shared room | `defineBossRoom` over `services.instances`; access policy remains content-owned. |
| Kill credit, loot, collection log | Encounter content and disposable kill hooks; these are policy, not combat mechanics. |

Registry unload is identity-based. `EncounterRegistry.unregister` and `clear()` notify
`EncounterManager`, which immediately disposes runtimes bound to the removed definition and cancels
their handles/resources. `MechanicRegistry` likewise tracks handles by exact registration, so
natural completion releases tracking immediately and provider unload cancels old work without
touching a later replacement. Health reset and runtime
disposal cancel active mechanic handles; death prevents new bindings and safe scheduled callbacks
drop invalid work. Form transitions reset attack cadence while preserving the shared health pool.

## Live adopters and deliberate exceptions

| Encounter | Shared framework in live use | Bespoke or missing behavior kept explicit |
| --- | --- | --- |
| Kree'arra, General Graardor, Commander Zilyana, K'ril and guards | `defineBoss`; all four modules use `defineBossRoom` and `defineGwdAltar`; Kree uses shared knockback | Stronghold traversal, access/killcount rules, faction populations, graves, and Kree room-wide target choreography remain content-owned. |
| Scurrius and rats | `defineBossMechanics` with `spawnAdds`, `floorHazard`, and `delayedImpact` | Food-pile movement/bite sequence and cheese/reward policy remain local. |
| Blood, Blue, and Eclipse Moons plus blood jaguar | `defineBoss`, invulnerability binding, and `everyAttacks(3)` custom glyph cadence | Jaguar completion, clone-facing, storm lanes, brazier counters, and player-run/chest state remain local. |
| Araxxor, adds, and eggs | `defineBoss`, phases, encounter RNG, and shared floor hazards | Egg carry-over, add transformations, special choreography, corpse choice, Slayer gate, and drops remain local. |
| Nex and four mages | `defineBoss`, phases/thresholds, immunities | Mage-gate ordering is local; later phase attack pools and special attacks are not implemented without authoritative data. |
| Six Barrows brothers | `defineBoss`, provider-owned registration, shared stat-drain calculation | Brother on-hit rules and the player-owned run/chest/reward state remain local. |
| Giant Mole, Dagannoth Kings, Zulrah | `defineBoss` replaces the retired legacy boss-script registry | Basic attack definitions are live. Mole burrowing and full Zulrah cloud/snakeling/form choreography remain unimplemented rather than guessed. |
| Quest boss-like fights | Core effects and quest-owned callbacks | Stage-gated form/death/progression choreography intentionally stays with its quest rather than becoming a global encounter solely for uniformity. |

This closes the duplicate framework and the reusable lifecycle contracts. It does not claim full
mechanical parity for the explicitly listed content gaps.
