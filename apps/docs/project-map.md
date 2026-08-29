# Project map

Use this page to choose a file's owner before adding or moving it. The detailed boundary
rules live in [Architecture](architecture.md) and
[Repository layout](contributing/repository-layout.md); apply the
[naming standard](contributing/naming.md) after choosing the owner.

## Top-level ownership

| Path | Owns | Must not own |
| --- | --- | --- |
| **apps/client/src/** | Browser bootstrap, input, rendering, features, and UI | Authoritative game rules or server persistence |
| **apps/server/src/** | Tick runtime, networking, game systems, worlds, and persistence | Browser presentation or reusable cross-app engine code |
| **apps/server/src/content/gamemodes/** | Required rules/content for one stable world identity | Generic engine infrastructure |
| **apps/server/src/content/modules/** | Optional modules that register against compatible worlds | A gamemode's required core behavior |
| **apps/docs/** | User, architecture, operations, and contributor documentation | Runtime inputs |
| **packages/game-model/** | App-independent domain models and stable rules | I/O, browser, or server services |
| **packages/protocol/** | Shared wire contracts and identifiers | Server handlers or client UI |
| **packages/osrs-engine/** | Inherited cache/config/model/scene engine | August product workflows |
| **packages/custom-content/** | Shared August extensions to engine behavior | Server-only content |
| **tools/** | Cache, data, diagnostics, migrations, testing, and repository-policy commands | Runtime request handling |
| **data/catalogs/** | Reviewed maintained inputs | Generated snapshots |
| **data/generated/** | Reproducible datasets and reports | Hand edits without a generator |
| **data/references/** | External evidence and import sources | Runtime dependencies |
| **apps/server/var/** | Ignored state, downloaded cache, logs, locks, and temp files | Source-controlled assets |

## Common changes

| Change | Primary owner | Related boundary |
| --- | --- | --- |
| Client bootstrap/configuration | **apps/client/src/app/** | **core/** for reusable browser infrastructure |
| Player-facing client feature | `apps/client/src/features/<feature>/` | protocol package for shared wire changes |
| Reusable client UI | **apps/client/src/ui/** | feature-specific UI stays with the feature |
| Cache/model/scene engine | **packages/osrs-engine/** | app adapters stay in the owning app |
| Shared model or rule | **packages/game-model/** | no app dependencies |
| Packet/message contract | **packages/protocol/** | client encoder and server handler |
| Tick/action/combat system | **apps/server/src/game/** | gamemode providers for world-specific rules |
| Collision, routes, or instances | **apps/server/src/{world,pathfinding}/** | generated map data |
| Authentication or synchronization | **apps/server/src/network/** | protocol package |
| Gamemode progression/content | `apps/server/src/content/gamemodes/<id>/` | stable ID and state migration |
| Optional admin/content module | `apps/server/src/content/modules/<id>/` | registration permission checks |
| Canonical override/catalog | **data/catalogs/** | schema and runtime reader |
| Generated runtime dataset | **data/generated/** | owning tool and provenance |
| Cache acquisition/export | **tools/cache/** | osrs-engine package |
| Data import/build | **tools/data/** | catalogs/generated output |
| Audit or investigation | **tools/diagnostics/** | lifecycle/provenance header |
| Persistent-state migration | **tools/migrations/** | backup and rollback plan |
| Test infrastructure | **tools/testing/** | feature assertions remain with owner |
| Repository boundary check | **tools/repository/** | keep policy checks independent of app runtime |
| Documentation | **apps/docs/** | add the page to **apps/docs/.vitepress/config.mts** |

## Dependency direction

```text
apps ───────────────► packages
tools ──────────────► packages + data + app maintenance surfaces
packages ───────────► lower packages only
runtime readers ────► catalogs/generated
references ─────────► import tools only
```

Forbidden directions:

- a package importing **apps/**;
- a runtime app importing **tools/**;
- one app importing another app's private source;
- protocol and osrs-engine duplicating the same contract;
- runtime code loading **data/references/**;
- committed source depending on **apps/server/var/** contents.

Tools may import an application for generation, diagnostics, or test orchestration only
when `@august/tools` declares that workspace dependency. Applications never import back
from tools, so this maintenance direction cannot enter runtime composition.

## Dynamic and persistent boundaries

Static reachability is insufficient for:

- **apps/server/src/content/gamemodes/*/index.ts**, discovered by gamemode ID;
- **apps/server/src/content/modules/*/index.ts**, discovered as content modules;
- scripts registered through server registries;
- files reached by cache/data identifiers rather than imports.

Game-mode IDs, save keys, protocol identifiers, cache symbols, and database schema
versions are contracts. Rename them only with an explicit migration and compatibility
plan.

## Placement decision

Before creating a file, answer:

1. Who consumes it?
2. Is it application behavior, a reusable package API, maintenance tooling, reviewed
   data, generated output, a reference, mutable state, or temporary evidence?
3. What dependency direction does it introduce?
4. What test or validation proves the boundary?
5. What event removes it if it is temporary?

If two owners appear equally valid, resolve the API boundary instead of copying the
implementation.

## Safe move loop

1. Run **pnpm run check** and record the baseline.
2. Search imports, dynamic loaders, string paths, scripts, CI/deploy configuration,
   documentation, and persisted identifiers.
3. Move one cohesive ownership unit and update its consumers.
4. Keep a compatibility adapter only when required; mark owner, target, and removal
   condition.
5. Run focused tests, then **pnpm run check**.
6. Remove the old path only when no runtime, tool, or documentation consumer remains.
