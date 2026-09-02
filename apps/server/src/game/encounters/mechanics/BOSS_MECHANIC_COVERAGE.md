# Boss mechanic coverage

This is the authoritative mapping for the universal mechanics in
`Granular-Notes.txt` §9.  A mechanic is **covered** when it has exactly one
authoritative implementation and a documented encounter authoring path.  It
does not have to be a mechanic-library factory when it belongs in the combat
engine, instance service, or loot system instead.

## Available reusable mechanic factories

| Mechanic | Authoring API | Lifecycle |
| --- | --- | --- |
| Marked floor tile / delayed impact | `spawnFloorHazard` | Telegraph GFX, optional projectile, per-player impacts, reset/despawn cancellation |
| Adds / minions | `spawnAdds` | Formation, ownership, aggression, expiry, reset/despawn removal |
| Interruptible healing | `interruptibleHeal` | Tick healing, optional duration, cancellation, reset/despawn cleanup |
| Soft/hard enrage | `enrageTimer` | One delayed, cancellable encounter callback |
| Shield / invulnerability | `invulnerabilityWindow` | Restores NPC state on expiry, reset, or despawn |
| Damage cap | `damageCap` | Enforced by both combat hit pipelines |
| Direct player effects | `statDrainHit`, `prayerDrainHit`, `freezeBindHit`, `stunHit`, `knockback` | Immediate, deterministic, reusable effects |

Every factory is registered in `MechanicRegistry` when its module is imported,
and a repeatable factory must be launched with
`runtime.runMechanic(bindingId, "replace" | "ignore" | "stack", factory)` when
the trigger can overlap a prior activation.

## Universal mechanic matrix

| Granular note | Authoritative system / authoring path | Status |
| --- | --- | --- |
| Floor/tile hazard | `spawnFloorHazard` | Covered |
| Visible projectile dodge | `spawnFloorHazard` with `projectileId` and destination tiles | Covered |
| Overhead-prayer read | `EncounterAttackDefinition.type` plus normal combat prayer evaluation | Covered — core combat, not a separate timer module |
| HP-threshold transition | `EncounterRuntime.thresholds` / `EncounterManager.onThresholdCrossed` | Covered |
| Add/minion spawning | `spawnAdds` | Covered |
| Interruptible healing | `interruptibleHeal` | Covered |
| Equipment requirement | `hasEquipmentRequirements` + encounter attack `condition` | Covered |
| Stat drain | `statDrainHit` | Covered |
| Prayer drain | `CombatAttackEffects.prayerDrainFraction` or `prayerDrainHit` | Covered |
| Freeze/bind | Core hit effects or `freezeBindHit` | Covered |
| Stun | `stunHit` | Covered |
| Knockback/displacement | `knockback` | Covered |
| Poison/venom | Core poison/venom system and NPC combat effects | Covered — not a mechanic module |
| Target switching / multi-aggro | `selectEncounterTargets` | Covered |
| Instanced/shared encounter | `services.instances` | Covered — world/instance infrastructure |
| Soft/hard enrage | `enrageTimer` with an encounter-defined soft/hard enrage callback | Covered |
| Invulnerability/shield counter-action | `invulnerabilityWindow` plus encounter-defined counter-action | Covered |
| Damage cap | `damageCap` / NPC incoming-hit cap | Covered |
| Kill-credit / loot gating | Encounter content + kill hooks / collection-log and loot services | Covered as encounter-content policy, not a generic combat effect |

## Deliberate ownership boundaries

- Do not duplicate poison, venom, protection-prayer, combat accuracy, or
  instance ownership in mechanic factories.  Those are global engine rules.
- A reusable encounter factory owns temporary state and always returns a
  `MechanicHandle`; `resetHealth()` and `dispose()` cancel every active handle.
- New factories must be deterministic: all variation uses `runtime.rng`.
- Re-entrancy is mandatory: callers explicitly choose `replace`, `ignore`, or
  `stack` for every repeatable binding.
- State-overriding mechanics (`invulnerabilityWindow` and `damageCap`) must
  use `replace`; `stack` is reserved for independently coexisting mechanics
  such as separate floor hazards.

## Coverage result

All mechanics in §9.1 now have an authoritative owner and an encounter authoring path.

Do not create another bespoke version inside a boss module. Add any new
variation to the authoritative primitive named above.

## Existing-boss migration status

| Encounter | Shared mechanics now in use | Intentionally encounter-owned state |
| --- | --- | --- |
| General Graardor / Commander Zilyana / K'ril Tsutsaroth | Encounter attack definitions and core combat effects | Their rooms have no duplicated shared mechanic factory to replace |
| Kree'arra | `knockback`, encounter RNG | Room-wide tornado damage selection remains Kree-specific |
| Scurrius | `spawnAdds`, `spawnFloorHazard` | Food-pile movement and bite animation sequencing |
| Nex | Encounter thresholds, phases, core immunities | Mage gate ordering and hard health checkpoints |
| Moons of Peril | `invulnerabilityWindow` | Glyph, jaguar completion, storm lanes, and brazier counter-action state |
| Barrows | `applyStatDrains` | Brother-only on-hit effects and player-owned run/loot state |
