# Architecture

This page defines August's maintained dependency and runtime boundaries. For a quick
tour, start with the [repository overview](overview.md); for file placement, use the
[project map](project-map.md).

## Dependency layers

```text
applications                          apps/client, apps/server, apps/docs
     │
     ▼
shared packages                       game-model, protocol, osrs-engine, custom-content
     │
     ▼
reviewed data                         data/catalogs, data/generated, data/references

maintenance only                      tools/*
mutable runtime state                 apps/server/var/* (ignored)
```

Allowed package dependencies are:

| Package | May depend on |
| --- | --- |
| **@august/game-model** | none; app-independent base |
| **@august/protocol** | game-model |
| **@august/osrs-engine** | game-model and protocol |
| **@august/custom-content** | game-model, protocol, and osrs-engine |

Applications may consume packages. A package never imports an application, protocol and
osrs-engine internals are not copied into apps, and runtime code never imports a
maintenance tool. Tools may depend on declared application workspaces for generation,
diagnostics, and integration tests; dependency flow never returns from an app to tools.

## Browser application

**apps/client/src/** is organized by responsibility:

| Area | Owns |
| --- | --- |
| **app/** | bootstrap, configuration, service worker, and React shell |
| **core/** | browser infrastructure such as storage, diagnostics, and workers |
| **engine/** | client-side orchestration around shared engine APIs |
| **features/** | player-facing slices such as login, trade, plugins, and sidebar behavior |
| **ui/** | reusable browser UI, widgets, and rendering presentation |
| **assets/** | bundled fonts and images |
| **dev/** | development-only browser facilities |

Browser-only code stays in the client. Reusable OSRS cache/config/model/scene code belongs
in **@august/osrs-engine**; cross-app message contracts belong in
**@august/protocol**.

## Server application

**apps/server/src/** owns authoritative game state:

| Area | Owns |
| --- | --- |
| **network/** | WebSocket sessions, authentication, packet routing, encoding, and sync |
| **game/** | tick phases, actions, combat, state, services, and reusable game systems |
| **world/** and **pathfinding/** | cache-backed map state, collision, instances, and routes |
| **content/gamemodes/** | stable world identities, progression, and required content |
| **content/modules/** | optional content that can register against compatible worlds |
| **data/** | typed runtime access to reviewed repository data |
| **audio/**, **widgets/**, **custom/** | focused server adapters around their domains |

The entry point composes services; domain behavior belongs behind the relevant interface
or service. One process hosts one configured world so process-global providers cannot
mix rules between gamemodes.

`pathfinding/PathService.ts` is the single routing facade; its active grid algorithm and
strategies live under `pathfinding/engine/`. Command names and permissions resolve once
through `game/commands/`. Weapon special attacks resolve through
`game/combat/special-attacks/`, whose documented precedence prevents parallel special
attack systems from reappearing. Reusable boss definitions, mechanic lifecycles, rooms,
and timelines live under `game/encounters/`; reusable skill actions, requirements,
inventory transforms, gathering policies, production policies, and resource-node
lifecycle live under `game/skilling/`. Content supplies data and exceptional choreography
to those owners rather than cloning their loops.

## Tick lifecycle

The server drains client input, snapshots a tick frame, and runs named phases through
**TickPhaseOrchestrator**:

1. broadcast and pre-movement;
2. movement and music;
3. scripts, actions, and combat;
4. death, post-script, and post-effect work;
5. orphan cleanup and scheduled scripts;
6. outbound broadcast, with frame restoration if transmission fails;
7. autosave after the active frame closes.

Errors are isolated and logged by phase. A change that reorders a phase must include a
test for the ordering contract it changes.

## Networking

The browser and server communicate over WebSocket. **@august/protocol** owns shared wire
contracts; the client owns input encoding and state application, while the server owns
validation, authoritative mutation, and outbound synchronization.

Never add a second packet identifier table for convenience. Extend the owning protocol
surface and add byte-level or round-trip coverage when encoding changes.

## Content discovery

Gamemodes are discovered from
`apps/server/src/content/gamemodes/<id>/index.ts` and must export
**createGamemode()**. Content modules are discovered from
`apps/server/src/content/modules/<id>/index.ts` and must export **register()**.

Directory IDs are runtime and persistence contracts. Dynamic loading means a missing
static import is not proof that content is unused. Preserve loader validation and boot a
representative world after moving content.

## Cache and data

- **tools/cache/** owns acquisition, validation, collision generation, and cache export.
- **data/catalogs/** holds reviewed hand-maintained inputs.
- **data/generated/** holds reproducible runtime derivations and review reports.
- **data/references/** holds external evidence and import sources; runtime code does not
  depend on it.
- **apps/server/resources/** is reserved for read-only resources owned only by the server.
- **apps/server/var/** owns downloaded cache, mutable databases, locks, logs, and
  temporary output and is ignored.

Applications resolve repository data through their path/configuration boundary. Do not
reintroduce working-directory probes or write generated output into application source.

## Persistence

The server accesses persistence through **PersistenceProvider**. World and gamemode IDs
select isolated state under **apps/server/var/**; these IDs are durable keys, not display
labels.

Changing a schema or persistence path requires a migration under **tools/migrations/**,
a verified backup, dry-run output, invariant checks, and a rollback or forward-recovery
plan. See [Environment and data migrations](contributing/environment-and-migrations.md).

## Import aliases

| Alias | Boundary |
| --- | --- |
| **@client/** | private client source under **apps/client/src/** |
| **@server/** | private server source under **apps/server/src/** |
| **@tools/** | centralized maintenance tools |
| **@august/data/** | repository data |
| `@august/<package>` | public shared package API |

An app-private alias must not become a cross-application API. If both runtime apps need a
type or behavior, move it into the correct package and expose a deliberate public path.
The repository structure check enforces this for JavaScript and TypeScript runtime source
under **apps/*/src/**, including aliases, application package names, direct paths, and
relative paths that cross into another app. It also rejects both aliased and path-based
imports of **tools/** from runtime source.

Tests may intentionally exercise more than one application and therefore remain outside
this runtime boundary. Keep integration consumers under **apps/*/tests/** (or use an
explicit `.test.*`, `.spec.*`, `tests/`, or `__tests__/` marker when colocated). Shared
runtime helpers revealed by such a test still belong behind a public package API.

## Architectural change checklist

Before changing a boundary:

1. identify the single final owner and permitted dependency direction;
2. search static imports, dynamic loaders, commands, deployment paths, and persisted IDs;
3. move implementation and consumers together or add a marked compatibility adapter;
4. update tests, data provenance, and documentation;
5. run focused checks followed by **pnpm run check**;
6. remove the adapter when its recorded condition is satisfied.
