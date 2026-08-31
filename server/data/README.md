# Server Data

This directory contains reviewed inputs used by the game server. File size alone is
not evidence that a file is dead; most large JSON snapshots are active runtime data.

## Data classes

| Class | Examples | Source-control policy |
| --- | --- | --- |
| Runtime snapshots | `items.json`, `locs.json`, `npcs.json`, `npc-spawns.json`, `shops.json`, `npc-drops-wiki.json` | Commit; server behavior depends on them |
| Generated runtime derivations | `npc-aggression.json`, `npc-combat-*.json`, `npc-sounds.generated.json` | Commit with the generator/source noted in the change |
| Hand-maintained overrides | `doors.json`, `npc-sounds.overrides.json`, `projectile-params.json` | Commit and review carefully |
| Imported dialogue/content | `dialogue-imports/` | Commit after review |
| Reports/research | `reports/`, `npc-*-candidates.json`, `*.unresolved.json` | Not runtime by default; document consumers before moving or deleting |
| Mutable world/account state | `gamemodes/{id}/game.sqlite*`, `accounts.json`, `player-state.json` | Ignore; back up before migrations |
| Logs | `../logs/` | Ignore; never store runtime logs here |

## Rules

- Resolve package paths through `server/src/paths.ts`; do not rely on the caller's
  working directory.
- A generated file needs a known generator and a runtime consumer. If either is
  unknown, classify it as research until proven otherwise.
- Do not hand-edit large imported snapshots unless the file is explicitly an override.
- Never delete or rename a game-mode state directory as source cleanup. The directory
  name is part of the persistence key.
- Keep downloads and partial output in temporary paths, validate them, then replace a
  committed/runtime snapshot atomically.

The currently tracked large item, NPC, location, spawn, shop, sound, and drop files
are intentional. See `server/scripts/README.md` for maintenance commands.
