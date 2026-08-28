# Project Map

Use this page as the repository's index. It answers “where should this change go?”
without requiring knowledge of the entire engine.

## Top-level ownership

|            Path             |                                         Owns                                                         |               Does not own                    |
| ---                         | ---                                                                                                  | ---                                           |
| `client/`                   | Browser input, cache decoding, rendering, widgets, audio, and WebSocket client behavior              | Authoritative game rules or persistence       |
| `server/src/`               | Reusable game engine, networking, tick loop, persistence infrastructure, combat framework, instances | Rules tied to one game mode                   |
| `server/gamemodes/{id}/`    | A world's content, progression, quests, skills, shops, NPC definitions, and rule providers           | Cross-world engine primitives                 |
| `server/extrascripts/{id}/` | Optional content that works with any game mode                                                       | A game mode's required core content           |
| `server/data/`              | Reviewed, committed runtime inputs and generated runtime snapshots                                   | Logs, temp downloads, or mutable player state |
| `server/scripts/`           | Cache, data, audit, import, and diagnostic maintenance commands                                      | Runtime request handling                      |
| `docs/`                     | Contributor, architecture, operations, and parity documentation                                      | Runtime source data                           |
| `references/`               | External research/bootstrap sources with explicit provenance                                         | Unreviewed runtime truth                      |

## Common changes

|      I want to change…          |                  Start here                           |                        Related locations                           |
| ---                             | ---                                                   | ---                                                                |
| Boss/encounter framework        | `server/src/game/encounters/`                         | `server/src/world/InstancedAreaManager.ts`, game-mode boss content |
| Instance lifecycle or maps      | `server/src/world/`                                   | `client/common/instance/`, `server/src/game/encounters/`           |
| Player death or instance graves | `server/src/game/death/`                              | `server/src/game/state/PlayerInstanceGraveState.ts`                |
| Combat calculations             | `server/src/game/combat/`                             | `server/gamemodes/{id}/combat/`, `client/common/combat/`           |
| A Vanilla skill                 | `server/gamemodes/vanilla/skills/`                    | shared action contracts under `server/src/game/actions/`           |
| A quest                         | `server/gamemodes/vanilla/quests/definitions/`        | quest registry/service in the parent folder                        |
| NPCs, shops, drops, or spawns   | `server/gamemodes/vanilla/{npcs,shops,data}/`         | reviewed snapshots in `server/data/`                               |
| A developer command             | `server/src/network/commands/`                        | permission checks in `server/src/network/`                         |
| Login/account behavior          | `server/src/network/AuthenticationService.ts`         | `AccountStore.ts`, game-mode persistence data                      |
| Packet format                   | `client/common/network/` and `client/common/packets/` | client decoder and server encoding/handlers                        |
| Client movement/sync            | `client/game/{movement,sync,worldview}/`              | server network managers                                            |
| 3D rendering                    | `client/render/`                                      | `client/game/render/`, shaders and loaders                         |
| Native/cache widgets            | `client/widgets/`                                     | game-mode widget scripts under `server/gamemodes/{id}/widgets/`    |
| React application shell         | `client/components/`                                  | keep game/render logic out of React components                     |
| Cache export tooling            | `client/scripts/cache/`                               | consumers in `server/scripts/` and `server/data/`                  |
| Project documentation           | `docs/`                                               | add the page to `docs/.vitepress/config.mts`                       |

## Dependency direction

```text
game-mode content ───────► server engine ───────► shared client/common + cache types
browser application ────────────────────────────► shared client/common + cache types
maintenance tools ──────────────────────────────► reviewed data and public service APIs
```

The server engine must not import a specific game mode. Game modes contribute
providers and script services through the public interfaces under
`server/src/game/providers/` and `server/src/game/scripts/`.

`client/common` is currently the shared contract area even though it lives inside
the client package. Moving it is a future migration, not an ordinary cleanup task.

## Dynamic and persistent boundaries

These locations require extra care during refactors:

- `server/gamemodes/*` is discovered by `GamemodeRegistry`.
- `server/extrascripts/*` is discovered by `ExtrascriptLoader`.
- Special attacks and scripts also use registry/discovery patterns.
- Game-mode directory IDs select SQLite/account data under
  `server/data/gamemodes/{id}/`.
- Cache files and collision output are reproducible but expensive; mutable player
  databases are not reproducible.

Search for both static imports and loader/registry references before declaring a file
dead.

## Safe refactor loop

1. Run `yarn check` and record the baseline.
2. Move or simplify one cohesive domain at a time.
3. Update imports, path helpers, documentation, and tests in the same change.
4. Run the narrowest relevant tests, then `yarn check`.
5. Never mix data deletion, line-ending normalization, and semantic changes in one
   review.

Large coordinators such as `client/game/OsrsClient.ts` should be reduced through
behavior-characterized controller extractions, not arbitrary line-count splits.
