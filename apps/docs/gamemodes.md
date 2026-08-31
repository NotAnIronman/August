# Gamemodes

A gamemode is a stable world identity: progression, XP/drop rules, spawn/login behavior,
required content, providers, UI policy, and gamemode-specific persisted state.

Source lives under:

```text
apps/server/src/content/gamemodes/<id>/
```

The directory must contain **index.ts** or **index.js** exporting
**createGamemode()**. The runtime discovers directories by ID; a missing static import
does not mean a gamemode is unused.

## Inheritance

```text
GamemodeDefinition
└── BaseGamemode
    └── VanillaGamemode
        └── LeaguesVGamemode
```

- **BaseGamemode** supplies safe no-op/OSRS defaults but no full content suite.
- **VanillaGamemode** registers the normal August/OSRS systems and content.
- **LeaguesVGamemode** inherits Vanilla and overrides league progression, UI, drops, XP,
  tasks, and tutorial behavior.

Extend Vanilla when the new mode keeps most normal systems. Extend Base only when the
mode deliberately supplies its own providers and required content.

## Bundled modes

| Stable ID | Display name | Source |
| --- | --- | --- |
| **vanilla** | Vanilla | **apps/server/src/content/gamemodes/vanilla/** |
| **leagues-v** | Raging Echoes | **apps/server/src/content/gamemodes/leagues-v/** |

The stable ID selects source, configuration, and persistence. Changing display text does
not require a migration; changing the ID does.

## Create a gamemode

Create a kebab-case directory:

```text
apps/server/src/content/gamemodes/my-mode/
  index.ts
```

For a Vanilla-derived mode:

```typescript
import type { PlayerState } from "@server/game/player";
import { VanillaGamemode } from "@server/content/gamemodes/vanilla";

class MyMode extends VanillaGamemode {
    override readonly id = "my-mode";
    override readonly name = "My Mode";

    override getSkillXpMultiplier(_player: PlayerState): number {
        return 5;
    }
}

export function createGamemode(): MyMode {
    return new MyMode();
}
```

Add a world with that gamemode ID and a unique port to
**apps/server/config.json**, then run it:

```bash
pnpm --filter @august/server start:world -- --world=<world-id>
```

## What a gamemode owns

The **GamemodeDefinition** contract groups these responsibilities:

- XP, drops, eligibility, and item transformations;
- player initialization, serialization, restore, login, and disconnect hooks;
- tutorial state, spawn location, and handshake values;
- varp/widget events and UI controller behavior;
- script and provider registration;
- quest list and custom content payload;
- per-tick/player lifecycle hooks;
- startup initialization and disposal.

Do not implement generic networking, persistence machinery, collision, or tick
orchestration inside a gamemode. Those remain server engine services.

## Suggested structure

```text
my-mode/
  index.ts               composition and lifecycle
  data/                  reviewed mode-owned defaults
  providers/             mode-specific provider implementations
  scripts/               interactions and handlers
  services/              cohesive mode services
  widgets/               mode-specific widget behavior
  tests/                 optional focused fixtures/tests
```

Use only directories the mode actually needs. Avoid a speculative hierarchy.

## Providers and services

Gamemodes register provider interfaces consumed by the server engine. A provider is the
right boundary when worlds need different formulas or datasets without duplicating the
engine.

Initialization receives **GamemodeInitContext**, including cache-backed loaders, a
gamemode bridge, and a bounded server-service facade. Use those interfaces rather than
constructing a second inventory, combat, networking, or persistence system.

When reusing Vanilla behavior from a Base-derived mode, import and register only the
provider required. Do not extend Vanilla merely to access one formula, and do not copy a
provider into a second implementation.

## Handlers and content modules

**registerHandlers()** owns interactions required by the gamemode. Optional behavior
that should work across compatible worlds belongs in
**apps/server/src/content/modules/** and is registered after gamemode handlers.

If disabling the feature changes the world's identity or progression, it is gamemode
content. Otherwise it may be a [content module](content-modules.md).

## Data and persistence

Source-controlled defaults can live beside the gamemode under **data/**. Canonical or
generated repository-wide datasets belong in the root **data/** classes.

Mutable state lives under `apps/server/var/gamemodes/<id>/` and is ignored. Before
changing a state schema or ID:

1. create a verified backup;
2. add a migration under **tools/migrations/**;
3. run it against representative copied state;
4. verify invariants and rollback/forward recovery;
5. deploy compatible code and migration in the documented order.

## Validation

A gamemode change normally needs:

- focused tests for each changed rule or lifecycle hook;
- loader/registration coverage for new directories;
- persistence round-trip coverage when state changes;
- **pnpm --filter @august/server typecheck**;
- **pnpm --filter @august/server test**;
- **pnpm run check** before handoff;
- a manual boot/login smoke test for the affected world when runtime validation is safe.
