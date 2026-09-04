# Boss and skilling integration matrix

This is a cross-framework inventory of live server content. It records what is
shared, what is still bespoke, and which migrations can be made without
inventing encounter or skill behavior. The authoritative details for the two
frameworks live in
[boss mechanic coverage](https://github.com/NotAnIronman/August/blob/main/apps/server/src/game/encounters/mechanics/boss-mechanic-coverage.md)
and [the skilling framework](./skilling-framework.md).

## Shared ownership boundaries

| Boundary | Authoritative API | Ownership contract |
| --- | --- | --- |
| Encounter data | `defineBoss`, `attack.*`, `phase.atHealth`, `EncounterRegistry`, `registerOwnedEncounter` | Validate once; registration belongs to the script provider. Removing the exact definition immediately disposes its bound runtimes; stale cleanup cannot remove a replacement. |
| Encounter execution | `EncounterRuntime` | Own deterministic attack state, thresholds, mechanic cadence, spawned resources, and mechanic handles until reset or disposal. |
| Reusable boss mechanic | `defineBossMechanics`, `mechanic.*`, `MechanicRegistry` | Every repeatable binding declares `replace`, `ignore`, or `stack`; provider unload cancels active handles from that exact custom registration. |
| Skill action | `defineSkillAction`, `requestSkillAction`, `repeatSkillAction` | Normal skill loops use a `skill.*` kind and are interrupted as one family by movement or a new interaction. |
| Inventory recipe | `defineProductionSkill`, `applyInventoryTransform` | Inputs and outputs commit atomically; requirements, XP, craft events, timing, and repetition have one policy owner. |
| Gathering policy | `defineGatheringSkill`, core `ResourceNodeTracker` | Success/depletion/respawn policy is data-oriented; world object replacement stays in content. |
| Direct kill listener | `combat.registerOnNpcKilled` plus `registry.registerCleanup` | The returned disposer is idempotent and must be bound to provider cleanup. |
| Per-player content state | `ScriptLifecycle` helpers and player-owned scheduler tasks | Logout, world change, provider cleanup, and runtime reset must release state and tasks. |

## Reusable boss mechanic inventory

| Mechanic currently present | API | Current live adopters | Coverage note |
| --- | --- | --- | --- |
| Delayed floor/tile hazard and visible projectile tell | `spawnFloorHazard`, `mechanic.floorHazard` | Araxxor; Scurrius | Contract test covers registration; encounter tests should cover target selection and despawn cancellation. |
| Delayed actor-target impact | `delayedImpact`, `mechanic.delayedImpact` | Scurrius ranged/magic | Rechecks runtime life, exact source identity, source health, world view, plane, and room membership before impact; prayer/damage resolve at impact time. |
| Spawned adds/minions | `spawnAdds`, `mechanic.spawnAdds` | Scurrius | Runtime owns spawned NPCs and their expiry. |
| Interruptible timed healing | `interruptibleHeal`, `mechanic.interruptibleHeal` | No content adopter yet | Characterized for repeated healing, duration, and cancellation. |
| Timed enrage | `enrageTimer`, `mechanic.enrage` | No content adopter yet | Characterized as a one-shot encounter-owned callback. |
| Invulnerability/shield window | `invulnerabilityWindow`, `mechanic.invulnerability` | Moons of Peril | Characterized for restoring pre-existing NPC state on reset. |
| Incoming player-damage cap | `damageCap`, `mechanic.damageCap` | No content adopter yet | Characterized for restoring the prior cap on reset. |
| Stat drain | `applyStatDrains`, `statDrainHit`, `mechanic.statDrain` | Barrows uses `applyStatDrains` | Direct-effect contract is covered. |
| Prayer drain | Core `CombatAttackEffects.prayerDrainFraction`, `prayerDrainHit`, `mechanic.prayerDrain` | K'ril uses the core attack effect; quest Nezikchened has bespoke phase logic | Direct-effect contract is covered. |
| Freeze/bind | Core combat effects, `freezeBindHit`, `mechanic.freeze` | No direct factory adopter | Direct-effect contract is covered. |
| Stun | Core combat service, `stunHit`, `mechanic.stun` | Kree'arra combines stun with knockback | Direct-effect contract is covered. |
| Knockback/displacement | `knockback`, `mechanic.knockback` | Kree'arra | Contract covers diagonal and cardinal movement; aligned axes remain aligned. |
| Equipment gate | `hasEquipmentRequirements` plus attack conditions | No encounter helper adopter | Pure helper contract is covered; the content-specific failure response remains local. |
| Phase/health threshold | `EncounterDefinition.phases`, `.thresholds`, runtime threshold events | Araxxor phases; Nex gates; several bosses use local threshold state | The runtime owns detection, but content still owns choreography and counter-actions. |
| Weighted/conditional attacks and core hit effects | `EncounterAttackDefinition` | All registered encounters | Covers melee/ranged/magic selection, distance, cooldown, poison/venom, prayer bypass, minimum hit, stat/prayer drains, animation, projectile, graphic, and sound metadata. |
| Target selection and timelines | `selectEncounterTargets`, `scheduleEncounterTimeline` | Kree'arra has local multi-target logic; Scurrius uses the delayed-impact adapter | Target selection is reusable; fight-specific target sets and choreography stay local. |
| Instance, boss HUD, killcount, and collection-log lifecycle | `defineBossRoom`, `defineGwdAltar`, `services.instances`, encounter `bossHealthBar` and `killcount` metadata | All four GWD modules; dedicated instance bosses | Infrastructure concern, deliberately not duplicated as mechanic factories. |

## Boss and boss-like content inventory

| Encounter family | Mechanics currently implemented | Shared versus intentionally local |
| --- | --- | --- |
| Araxxor | Normal/enraged attack pools, venom, prayer/defence drain, six-attack specials, acid hazards, three egg/add types, mirrorback/ruptura/acidic behavior, corpse interaction, Slayer entry, drops | Uses phases and floor hazards. Egg damage carry-over, add transformation, corpse choice, and task/drop policy are encounter data and remain local. |
| Scurrius | Melee/ranged/magic pools, sub-30% final attacks, food-pile movement and healing, rat summons, rockfalls, delayed ranged/magic impact, cheese credit | Uses `defineBoss`, typed add/hazard/delayed-impact bindings, encounter RNG, and provider-owned registration. Food choreography and reward policy remain local. |
| Kree'arra and Armadyl guards | Conditional tornado/melee choice, room-wide targets, displacement/stun, three guard styles | Uses `defineBoss`, encounter RNG, shared knockback, `defineBossRoom`, and `defineGwdAltar`. Room-wide attack selection remains Kree-specific. |
| General Graardor and Bandos guards | Weighted melee/ranged attacks and three guard styles | Uses `defineBoss`, `defineBossRoom`, and `defineGwdAltar`; stronghold traversal, access/killcount policy, population, and graves remain content-owned. |
| Commander Zilyana and Saradomin guards | Close-range melee/magic attacks and three guard styles | Uses `defineBoss`, `defineBossRoom`, and `defineGwdAltar`; stronghold traversal, access/killcount policy, population, and graves remain content-owned. |
| K'ril Tsutsaroth and Zamorak guards | Melee/magic, poison, conditional guaranteed prayer-smash with prayer bypass/drain, three guard styles | Uses `defineBoss`, core combat effects, `defineBossRoom`, and `defineGwdAltar`; stronghold traversal and room policy remain content-owned. |
| Nex and four mages | Four hard health gates, ordered mage unlock/death progression, smoke-phase melee/magic | Threshold detection is shared. Gate ordering is encounter-specific. Later phase attack pools and specials are absent and require design/data rather than inference. |
| Blood, Blue, and Eclipse Moons | Glyph positioning/damage, shield windows, blood jaguars/healing, eclipse clone-facing sequence, blue storm lanes and brazier counter-actions, three-boss player-owned run/chest | Uses provider-owned `defineBoss` definitions, typed shield binding, and declarative three-attack glyph cadence. Special choreography is legitimately local. |
| Barrows brothers | Player-owned six-brother run; Ahrim Strength drain, Guthan heal, Karil Agility drain, Torag run drain, Verac prayer bypass, Dharok missing-HP scaling, chest/loot | All six use provider-owned `defineBoss`; shared stat-drain math is reused. Brother on-hit rules and player-owned run/chest state remain local. |
| Giant Mole, Dagannoth Kings, and Zulrah | Basic style-specific attack pools; Zulrah health phases | Provider-owned `defineBoss` replaces the retired legacy boss-script registry. Mole burrowing and full Zulrah cloud/snakeling/form choreography were not implemented by the legacy callbacks and remain explicit gaps. |
| Quest combat hooks | Dagannoth Mother form/prayer attack selection; Nezikchened prayer drain/dagger; Koschei four-form lethal-hit trial; multiple quest-owned pre-death form/progression gates | These are owner/stage-gated quest policy. Reuse low-level effects and deterministic RNG where useful; do not move quest progression into the global boss registry merely for uniformity. |

The last row deliberately excludes ordinary “kill this NPC to advance the
quest” handlers. Those are progression integration points, not reusable boss
mechanics.

## Vanilla skilling inventory

The vanilla aggregator currently registers all 15 domains below.

| Domain | Mechanics currently implemented | Lifecycle shape |
| --- | --- | --- |
| Agility | Gnome Stronghold log crossing, forced movement/animation, XP | Immediate obstacle interaction; the rest of the course is explicitly deferred. |
| Consumables | Normal/combo food, energy/stamina/rest, prayer/stat restores and boosts, poison cures, dose replacement | Short inventory actions intentionally use `inventory.*` groups rather than a repeatable `skill.*` loop. |
| Crafting | Flax picking/restoration, sheep shearing/restoration, spinning and sinew, gem/leather/jewellery/silver/glass recipes | Declarative production and atomic transforms are live; flax uses owned node/provider cleanup. Sheep positioning and shearing remain stateful content. |
| Firemaking | Tinderbox/log lighting, temporary fires/ashes, campfire creation and repeated log feeding | `skill.firemaking` and `skill.campfire`; tracker disposal restores geometry without granting natural-expiry ashes. Placement and campfire state remain local. |
| Fishing | Tool/bait checks, weighted catches, level chance, repeated fishing and spot routing | `defineGatheringSkill` owns the exact chance and cached tool timing; bait/catch and minnow exchanges are atomic. Moving spots and Echo Harpoon banking stay local. |
| Fletching | Log product batches, bow stringing, combined/ammunition recipes | All registered recipes use one declarative `skill.fletch` production family with preserved validation, XP, animation, events, timing and batching. |
| Herblore | Herb cleaning, unfinished potions, finished potions, amylase-to-stamina conversion | Exact clicked-slot inputs and every inventory exchange use pinned atomic transforms; recipe selection, dose/container identity and messaging remain local. |
| Mining | Pickaxe selection, level/success rolls, ore awards, depletion/replacement, respawn | Exact roll/depletion/respawn policies, cached tool timing, action repetition and owned tracker/provider cleanup are shared. |
| Prayer | Bone burial, ash scattering, altar recharge, altar offering multipliers and cooldowns | Immediate/deferred player actions with player-scoped cooldown and pending state cleanup. |
| Production | Range/fire cooking with burn results, tanning, bolt enchantment | Cooking and tanning use one production engine, including stochastic outcomes, base/effective level policy, surface locks and repeat data. Bolt spell/rune/graphic semantics remain local while using atomic transforms. |
| Runecrafting | Air-ruins entry by talisman/tiara, whole-inventory rune crafting with level multiplier, exit | World transition and multiplier policy remain local; the inventory exchange uses the shared atomic transform. Only Air rune content exists. |
| Sailing | Pandemonium introduction, dialogues, boarding/disembarking sequences, HUD/boat state restoration | Narrative/cinematic `sailing.*` actions, not a generic repeatable skilling loop. |
| Smithing | Furnace smelting, ore/coal/tool/facility checks, ring/gauntlet bonuses, anvil UI and item batches | Anvil and furnace recipes use declarative production and atomic exchanges; iron RNG, charge consumption, facility data and UI refresh are explicit hooks. |
| Thieving | Pickpocket success/failure, damage/stun, repeat behavior, coin pouches; picklocking | `skill.pickpocket` and `skill.picklock`; NPC/object outcomes stay content-owned, with atomic pouch conversion where applicable. |
| Woodcutting | Axe selection, level/success rolls, log outcomes, tree depletion/replacement, respawn | Exact roll/depletion/respawn policies, cached axe timing, action repetition and owned tracker/provider cleanup are shared. |

## Skilling behavior outside the vanilla skill aggregator

| Owner | Duplicate or special behavior | Integration decision |
| --- | --- | --- |
| Moons of Peril | Private fishing loop, bream cooking, grub grinding, paste/vial potion mixing, moth/prayer restore and Moonlight potion boosts | Preserve encounter item IDs, formulas, and no-XP policy. Migrate timing, atomic transforms, requirements, and cancellation to shared skilling primitives once characterization tests lock the intended encounter rules. |
| Godsword shard smithing | Synchronous shard assembly/disassembly, hammer requirement, lock/animation and no XP | Inventory exchange is ported to `applyInventoryTransform`; recipe priority and presentation stay local. |
| Nex forging | Torva repair, Bandos breakdown and Zaryte crossbow transformations, with locks/animations and no XP | Inventory exchange is ported to `applyInventoryTransform`; encounter item rules and presentation stay local. |
| Frozen Door | Four-piece key assembly and final-key consumption around quest completion | Inventory exchanges are ported to `applyInventoryTransform`; quest registration/completion, failure restoration and teleports stay local. |

## Duplicate patterns and API gaps

- Production handlers repeatedly implement requirement checks, batch sizing,
  inventory mutation/rollback, XP/events, messages, timing, and rescheduling.
  `defineProductionSkill` is the destination for deterministic recipes.
- Mining, Woodcutting, and Fishing duplicate tool selection, success rolls,
  depletion/respawn, and repeat policy. `defineGatheringSkill` and the core
  `ResourceNodeTracker` own those common decisions; world replacement remains
  content-specific.
- Level checks are inconsistent between base and effective levels. Every
  migrated requirement must explicitly choose `source: "base"` or
  `source: "effective"`; migration must not silently normalize game rules.
- Scurrius now proves the encounter-owned `delayedImpact` adapter, including
  source identity, world/room, target, lifecycle, and impact-time damage checks.
  Barrows and quest-specific delayed patterns remain candidates where behavior
  matches; do not flatten their progression/on-hit policy merely for reuse.
- GWD room creation/join/peek/leave, door actions, population, grave wiring,
  and altar cooldown/recharge now use `defineBossRoom` and `defineGwdAltar`.
  Faction-specific traversal remains in its owning content module.
- Encounter runtime randomness is seeded, while several quest/Barrows and skill
  paths still call `Math.random`. A scoped skilling/content RNG is needed for
  repeatable tests and replay; probability formulas must not change during that
  migration.
- Event emission is inconsistent across main production, gathering, and special
  no-XP transformations. The shared factories should declare their XP and event
  policy instead of consumers inferring it.

## Migration matrix

| Priority | Current owner(s) | Destination | Status and acceptance contract |
| --- | --- | --- | --- |
| P0 | Confirmed-kill listeners in boss killcounts, GWD keys, and Scurrius | Disposable `registerOnNpcKilled` bound to `IScriptRegistry.registerCleanup` | Resolved. Reload has exactly one active listener, one kill has one delivery, and reset removes it. |
| P0 | Encounter definitions in dedicated and legacy boss content | `defineBoss` plus `registerOwnedEncounter` | Resolved for Araxxor, Scurrius, all four GWD factions, Nex, Moons, Giant Mole, Dagannoth Kings, Zulrah, and all six Barrows brothers. Unload/clear immediately disposes runtimes bound to the exact removed definition. |
| P1 | Deterministic Crafting/Tanning/Smithing/Fletching recipes | `defineProductionSkill`, atomic inventory transforms, explicit requirements | Resolved for the registered recipe sets. Messages, validation order, base/effective levels, timing, XP, output placement, batching, repeat context, UI refresh and craft events are preserved by focused parity coverage. |
| P1 | Mining/Woodcutting/Fishing | `defineGatheringSkill` and core resource-node tracking | Resolved for their existing loops. Exact roll curves, tool priority/timing, depletion probability, respawn duration and ownership-safe provider cleanup remain injectable/content-owned. |
| P1 | Moons embedded fishing/cooking/potion work | Shared action/requirement/transform primitives with encounter-owned recipes | Open. First characterize exact cancellation, double-yield, no-XP, and output behavior. |
| P1 | Scurrius, Barrows, and quest delayed attacks | `mechanic.delayedImpact` / encounter-owned timelines | Partly resolved. Scurrius is the live characterized adopter with cancellation and impact-time validation; migrate Barrows/quest paths only after their distinct policy is characterized. |
| P1 | Scurrius food phase and Nex health gates | Declarative thresholds/mechanic bindings where behavior already matches | Partly migrated. Keep pathing, counter-action, and gate-order callbacks local; do not infer missing Nex attacks. |
| P2 | Godsword shard smithing and Nex forging | `applyInventoryTransform` | Resolved. Full-slot rollback and output insertion are shared; no-XP policy, locks, animations, requirements and messages remain unchanged in their content owners. |
| P2 | Frozen Door key assembly and final-key consumption | `applyInventoryTransform` | Resolved. Key inventory exchanges use the shared atomic transform; quest registration/completion, failure restoration and teleports remain content-owned. |
| P2 | Four GWD instance modules | `defineBossRoom` and `defineGwdAltar` | Resolved for room/door/party/altar plumbing. Stronghold traversal, keys/killcount rules, faction populations, and grave reclaim policy remain intentionally content-owned. |
| P2 | Global `Math.random` in content/skills | Scoped deterministic RNG passed through policies | Open. Seeded repeatability tests must demonstrate unchanged distributions. |
| Deferred | Nex later phases/specials; full Agility course; non-Air Runecrafting; broader Sailing | Content definitions and authoritative data | Requires design/cache data/parity decisions; do not guess. |

## Contract coverage added with this audit

- `mechanics-integration-contracts.test.ts` locks built-in mechanic
  registration, state restoration, timed heal/enrage lifecycle, direct player
  effects, equipment checks, cardinal knockback, and the `skill.*` interruption
  family.
- `npc-kill-listener-lifecycle.test.ts` loads the real boss-killcounts provider
  through `ScriptRuntime`, reloads it, dispatches once, and resets the runtime to
  prove unregister/no-duplication behavior.
- `encounter-registration-lifecycle.test.ts` proves an owned encounter can be
  replaced during provider reload without duplicate registry state and is
  removed on runtime reset. It also proves unregister/clear immediately dispose
  exact-definition runtimes and that stale cleanup preserves a replacement.
- `boss-mechanics-dsl.test.ts` covers shorthand validation, per-runtime cadence,
  deterministic RNG, custom-registry replacement, active-handle cancellation,
  legacy boss ports, stale-definition disposal, and delayed-impact cancellation.
- `boss-room.test.ts` covers shared room create/join/peek/leave plumbing and GWD
  altar membership/cooldown behavior.
- `skilling-framework.test.ts` covers exact rollback after late output failure,
  malformed recipe rejection, quantity-aware carried tools, action-group
  conflicts, cached timing, stochastic outcome hooks, level source, request
  groups and material-before-RNG ordering.
- `gathering-tracker-lifecycle.test.ts` covers replacement, stale disposers,
  same-instance re-registration, callback isolation, natural expiry and
  reward-free provider cleanup.
- `skilling-migration-parity.test.ts` and
  `fletching-handler-registration.test.ts` lock legacy validation order and UI
  refresh behavior at migrated boundaries.
- `skilling-content-boundaries.test.ts` covers exact clicked-slot Herblore
  transforms, mixed pinned/unpinned reservations, atomic bolt and pouch
  exchanges, and remaining bespoke action-boundary contracts.

The focused framework tests are intentionally orthogonal to encounter content
tests. Remaining high-value integration tests are end-to-end recipe/data sweeps
through real inventory metadata, provider unload during bespoke world-state
choreography, and characterization of the deliberately deferred Moons paths.
