# Grotesque Guardians and Shellbane Gryphon foundation

## Implemented

- Solo and up-to-five-player party instances, with multi-combat enabled in both modes. Party joins use the original instance's scene origin and world-view ID.
- Chunk-aligned copies of the requested bounds, with four tiles of padding and all four terrain planes. Guardians bounds corrected to X 1673–1720 / Y 4552–4597.
- Requested spawns: Dusk 7882 at 1689,4573; Dawn 7852 at 1701,4573; Shellbane gryphon 14860 at 3179,8872. All use plane 0, native attackable models and the existing authored animation roles.
- Reviewed first-form combat profiles: Dawn/Dusk 450 HP each; Gryphon 400 HP. Ordinary attacks work; special mechanics are intentionally deferred.
- Permanent, per-character Guardians gate unlock. Click Unlock with brittle key 21724 in inventory, or use the key on the gate. One key is consumed and the account snapshot saved. Native varbit 2468 (varp 1666, bit 0) drives the real locked/unlocked gate models, 31672/31673. Every party member needs their own unlock.
- Guardians award one KC/reward only after both NPCs die, in either order. Contributions are combined across both. Both respawn together after 20 ticks; killing only one gives no loot or repeat spawn. Gryphon also respawns after 20 ticks.
- Eligible party members receive separate rolls, collection-log credit and pet provenance using the existing pet-award path. Thresholds reuse the established party policy: duo 30%, trio 25%, four 20%, five 15% of encounter maximum HP; solo requires positive damage. Recipients must still be members in the same world view/plane when the encounter completes.
- Reviewed manual loot tables are used by both the drop registry/viewer and encounter rewards. Guardians: granite dust, two unique/ordinary table cycles, bundled potions and one tertiary cycle. Gryphon: bones/feathers, one Belle's folly roll (1/75), two ordinary cycles, and one tertiary cycle. Shared seed/herb probabilities use exact subtable weights. Konar keys are task-gated. No unconditional elite clue/casket from the incomplete import.
- Shared boss HUD switches to the remaining already-spawned boss when the current one dies. Reload cleanup cancels respawns and returns members safely.

## Cache geometry clarification

The cache places entrance controller **31681 at 3426,3542, plane 2** in the Slayer Tower. The supplied **1697,4567,0** is on the public roof, next to exit 31674, rather than at that controller. The existing gate is wired; no duplicate gate was invented. Instance entry stays at 1696,4567,0 and the requested return tile stays 1697,4567,0. From the public roof, using its exit descends to 3427,3542,2 beside the gate.

Gryphon's missing exit was found in the cache: **58442**, at 3167,8873,0 (a three-tile footprint). It returns to 3175,2478,0. Entrance controller 58439 is pinned to its visible cave model 58440 independently of the unimplemented quest morph.

## Deliberately deferred

- Full Guardians phase transitions, invulnerabilities/style restrictions, hammer finishing, lightning, spheres, rockfall, prison and phase-specific stats.
- Gryphon tortugan-shield rules, corrosive spit, weight/knockback checks, whirlwinds and special projectile timing.
- Slayer-task/quest entry gates beyond the explicitly requested brittle-key unlock. Foundation fights remain available for testing without those additional requirements.
- Quest-specific guaranteed clue rewards and Combat Achievement clue-rate bonuses. Ordinary clue rolls use the project's existing clue-box conversion. Rare Gryphon gem-table spear/shield results convert to a nature talisman until Legends' Quest completion is available/recorded.
- Raid-style reconnect checkpoints and loot UI: these are ordinary boss rooms with normal ground drops, not Theatre runs.

## Testing checklist

1. Unlock the Guardians gate with a fresh character, relog, and confirm it remains unlocked without another key. An unkeyed party member must not bypass it.
2. Create a party, join from another client, and verify both clients see and can attack the same bosses. Also verify independent solo rooms.
3. Kill Dusk first, then Dawn; reverse the order next time. Verify no premature loot/KC, one final reward per eligible member and both bosses returning together.
4. Kill Gryphon, claim loot, wait for respawn, and use the cave exit. Leave before a respawn and check no orphan encounter returns.
5. Check movement, terrain rendering and gate morphs on the hosted client. Automated cache tests do not replace a live multiplayer playtest.

Validation: focused foundation/cache/drop/instance/HUD suites, client/server typechecks and production client build. Rebuild the hosted client, restart the server, then hard-refresh clients.

## Mechanics research for the next pass

Guardians need a pair-owned phase controller, retaining combined contribution credit while switching active forms. Gryphon needs room-owned wind hazards and a player equipment/weight check. The current room/reward lifecycle is separate from those mechanics so adding them does not require replacing instance or loot handling.

Sources: [Grotesque Guardians](https://oldschool.runescape.wiki/w/Grotesque_Guardians), [Guardians strategy](https://oldschool.runescape.wiki/w/Grotesque_Guardians/Strategies), [Dawn](https://oldschool.runescape.wiki/w/Dawn), [Shellbane Gryphon strategy](https://oldschool.runescape.wiki/w/Shellbane_gryphon/Strategies), [indexed Gryphon wiki data](https://osrsindex.com/wiki/shellbane-gryphon?site=osrs_wiki). Cache geometry, IDs, models and animation roles were checked against the project's actual cache.
