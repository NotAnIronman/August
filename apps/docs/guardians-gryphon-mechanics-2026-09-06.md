# Guardians and Shellbane mechanics — 2026-09-06

This patch extends the existing solo/party rooms. It does not change entrances,
drop tables, loot eligibility, collection logs, or the shared Guardians killcount.

## Shellbane gryphon

- Melee and occasional ranged attacks use the normal equipment/defence accuracy
  evaluator. Wind spells gain the documented 50% accuracy and base-damage weakness.
- Every fourth attack chooses a special. Heavy equipped gear reduces the selection
  weight of knockback. Inventory contents never contribute to the 40kg check.
- Knockback gives heavy players two ticks to explicitly click Attack. Auto-attacks
  do not count. The counter shoves the boss one collision-checked tile and grants
  one extra melee attack without resetting the normal attack timer. Food and
  combo-food delays still prevent the counter. Uncountered knockback deals 0–30
  damage and does not stun the player; it cannot push through scenery.
- Corrosive spit targets the original tile, with two ticks to move. Corrosion hits
  six times, at offsets 2/8/14/20/26/32 after impact, for 3–12 each. Removing all
  worn gear, leaving the instance, death, or a wipe clears it.
- Whirlwinds form at offsets 0/3/6/9/12. Repeated tiles grow in strength. They
  activate at tick 18 and burst at tick 43. Native scenery IDs 57917–57926 provide
  all five inactive/active variants; sequences 12581–12585 provide the explosions.
- Initial tuning: strength-five burst is 50–60, with cave-wide reach. Lower
  strengths use the supplied damage/radius table. The previously supplied armour
  icon ID 1361 is retained in the asset constants for a future status indicator;
  this patch reports corrosion through game chat rather than adding a new HUD.

## Grotesque Guardians

1. Dawn is vulnerable to ranged, magic, and halberds. Dusk is immune. Dawn's two-hit
   ranged attack, kick, and targeted 3×3 stone ball are active; the stone ball has
   two ticks of travel and freezes for ten ticks.
2. At 55% Dawn HP, Dusk becomes melee-only, with −1 flat armour and burn immunity.
   Dawn ascends. Dusk uses a charged wing sweep after his first ordinary attack;
   rockfall scatters 9–10 distinct shadows with four impact speeds. Rock impacts
   cover 3×3 tiles, with a ten-tick centre stun. Standing underneath Dusk is unsafe.
3. At 55% Dusk HP, the pair become invulnerable for the lightning transition.
   Dusk moves west; lightning includes each player's tile and uses a two-tick
   warning before damaging its tile and neighbours. Dawn then returns with three
   collectible, three-stage healing spheres. Remaining spheres heal 90 each.
4. Dawn's death empowers Dusk: his native 6×6 form and the supplied combat stats
   replace the first form. Fire prisons give five ticks to use the missing flame
   opening. Failure deals up to 65 and heals Dusk by actual damage. Only the first
   prison is invulnerable. Melee/ranged selection follows the supplied protection-
   aware probabilities, including the special first ranged hit and nested second
   damage roll. Dusk remains melee-only.

Without Gargoyle smasher (varbit 4027), each final Guardian is held at one HP;
use a rock hammer (4162) or rock thrownhammer (21754) on it below ten HP. Normal
hammer reach is one tile, thrownhammer reach nine, both requiring line of sight.
The existing native finish/death/reward pipeline remains authoritative.

The cache's ordinary Guardian footprint is **4×4**, not the 5×5 mentioned in the
reference prose; the empowered form is 6×6. The implementation follows the actual
cache forms so rendered size, pathing, and damage reach agree.

## Party behavior and initial tuning

Targeted attacks use the boss's current target, falling back to the closest living
member. Everyone can be hit by shared floor hazards. Each party member gets an
independent prison; any member can collect a healing sphere. Timers and hazards
are instance-owned and are cleared on completion, wipe, instance disposal, or
content reload. Finishing both Guardians still produces exactly one reward.

The supplied reference omits several exact cadences. Initial adjustable values
are centralized in `GRYPHON_TIMING` and `GUARDIANS_TIMING`: fourth-attack special
selection, 12-tick wing charge, 14-tick rockfall cadence, 10-tick lightning phase,
six-tick sphere stages with absorption at 24 ticks, and every-eighth-attack prisons.
These are playtest tuning choices, not claims of exact official-server timing.
The optional tortugan-shield rule was asked about separately; until confirmed,
the implementation uses ordinary partial melee protection without a new shield
requirement.

## Integration and testing

- `EncounterSupport` owns scoped timers, graphics, temporary scenery, targeting,
  collision-checked movement, and ordinary combat accuracy rolls.
- Each room life owns either `GuardiansEncounter` or `GryphonEncounter`; generic
  NPC attacks are intercepted only for the matching live actors in that instance.
- A final damage gate covers ordinary hits, delayed projectiles/echoes, and
  scripted player-attributed damage. In-flight attacks cannot bypass a new phase.
- Native healing-sphere collision is overridden on both client and server so
  walking over the spheres works. Models, names, and animations are preserved.
- Equipped weight reads cache grams as kilograms. Some older imported item
  catalogue weights are inconsistent; the new mechanic does not rely on them.

Focused tests cover phase floors, weapon restrictions, hammer/unlock finishing,
party prison isolation, sphere healing, spit dodging/expiry, counter/food timing,
whirlwind stacking and cave-wide bursts, rockfall, wing charges, stone balls,
prayer reductions, wind-only weakness, native cache assets/collision, and cleanup.
The existing foundation tests continue to cover party entry, eligibility, reward
deduplication, and whole-encounter respawn. Live visual/playtesting is still needed.

For host testing, pull the updated source, rebuild the **client**, restart the
server, and reload the client. Test a fresh instance. Existing active instances
should not be used across the content reload.

## References

- User-supplied mechanics and animation assignments are the primary specification.
- [Shellbane strategy reference](https://oldschool.runescape.wiki/w/Shellbane_gryphon/Strategies)
- [Elemental weakness table](https://oldschool.runescape.wiki/w/Elemental_weakness)
- [RuneLite cache animation names](https://github.com/runelite/runelite/blob/master/runelite-api/src/main/java/net/runelite/api/gameval/AnimationID.java)
- [RuneLite cache effect names](https://github.com/runelite/runelite/blob/master/runelite-api/src/main/java/net/runelite/api/gameval/SpotanimID.java)

IDs were checked against the local osrs-237_2026-03-25 cache, not assumed solely
from current external constants. Editor assignments are read, never rewritten.
