# Special-attack architecture

This directory owns the complete server-side special-attack execution boundary.
The combat engine resolves an activated attack in this order:

1. `WeaponSpecialAttackRegistry` finds an item-specific script in
   `implementations/`. These scripts own dynamic traits and post-hit behavior.
2. `CombatPluginRegistry` may supply a special profile from the same
   implementations barrel for profile-driven weapons.
3. `FallbackSpecialAttackProvider` supplies the compatibility definition from
   the active gamemode only when neither detailed system handled the weapon.

The order is deliberate and enforced in `CombatHitProcessor`; a weapon is never
executed by more than one layer. New weapons must use an implementation/profile.
The fallback catalog exists to preserve older definitions while they are migrated.

`SpecialAttackVisualProvider` and `InstantUtilitySpecialProvider` are side-effect
contracts for visuals and non-combat skilling specials. Vanilla catalog data lives
with vanilla content under `content/gamemodes/vanilla/combat` and registers through
the central provider registry during gamemode initialization.

## Adding or migrating a special

- Put one weapon family per PascalCase file in `implementations/`.
- Preserve item IDs, energy costs, timing, and wire-visible effects in focused tests.
- Export profile-based implementations from `implementations/index.ts`.
- Do not add a second registry or a direct item-ID switch elsewhere in combat code.
- When a detailed implementation replaces a fallback entry, remove the fallback
  entry in the same change and prove parity with a regression test.
