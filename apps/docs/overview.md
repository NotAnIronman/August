# Repository overview

August is an OSRS-parity TypeScript monorepo with two runtime applications, one
documentation application, four shared packages, centralized maintenance tools, and
explicit data classes.

## System at a glance

```text
apps/client ── browser input, rendering, UI ──┐
                                              ├── @august/protocol ── WebSocket ── apps/server
apps/client ── @august/osrs-engine ───────────┤                         tick loop, worlds,
apps/server ── @august/osrs-engine ───────────┘                         persistence, content

@august/game-model      app-independent domain contracts
@august/protocol        wire contracts; depends on game-model
@august/osrs-engine     inherited cache/config/model/scene engine
@august/custom-content  August engine extensions shared by both apps
```

The package dependency direction is acyclic:

```text
protocol       -> game-model
osrs-engine    -> protocol + game-model
custom-content -> osrs-engine + game-model
```

Applications may depend on packages. Packages never import applications. Maintenance
tools may use package APIs, but runtime applications do not import tools.

## Repository map

| Area | Purpose |
| --- | --- |
| **apps/client/src/** | React/WebGL browser application, organized as app, core, engine, features, and UI |
| **apps/server/src/** | Node/WebSocket server, tick runtime, networking, persistence, and world systems |
| **apps/server/src/content/gamemodes/** | Dynamically discovered world identities and rules |
| **apps/server/src/content/modules/** | Optional cross-gamemode content modules |
| **apps/docs/** | This VitePress site and contributor documentation |
| **packages/** | Public cross-application boundaries |
| **tools/** | Cache, data, diagnostics, migration, testing, and repository-policy commands |
| **data/catalogs/** | Reviewed hand-maintained inputs |
| **data/generated/** | Reproducible runtime datasets and reports |
| **data/references/** | External evidence and import sources |
| **apps/server/var/** | Ignored mutable state, locks, and runtime output |

## Runtime flow

1. The client loads cache-backed definitions, renders the world, and encodes player
   actions through the protocol package.
2. The server authenticates a session, selects the configured gamemode, and owns all
   authoritative state.
3. A fixed tick loop processes input, movement, actions, scripts, combat, synchronization,
   persistence, and outbound packets.
4. Gamemodes and content modules register behavior through server interfaces; loaders
   discover them by stable directory ID.
5. Reviewed catalogs and generated datasets feed runtime services. Mutable player/world
   state never becomes source data.

## Start and validate

```bash
pnpm run setup
pnpm run prepare:data
pnpm run start
pnpm run check
```

See [Setup](setup.md) before the first run. Use the [Project map](project-map.md) to place
a change, [Architecture](architecture.md) for runtime boundaries, and
[Contributor policies](contributing/index.md) for naming, tests, generated data, and migrations.
