# Content modules

Content modules are optional server features that can register against compatible
gamemodes. The former “extrascript” registration keys remain stable where persistence or
debug tooling depends on them, but new documentation and directories use **content
module**.

Modules live under `apps/server/src/content/modules/<id>/` and export **register()**.

## Create a module

```text
apps/server/src/content/modules/hello/
  index.ts
```

```typescript
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerCommand("hello", (event) => {
        services.messaging.sendGameMessage(event.player, "Hello from a content module!");
    });
}
```

The loader discovers directories containing **index.ts** or **index.js**, validates the
export eagerly, and registers the module after gamemode handlers.

## What modules can register

- commands and permission-checked developer tools;
- NPC, location, item, and widget interactions;
- region entry/exit events;
- scheduled or tick behavior;
- optional content that is not part of one world's identity.

Set **SCRIPT_HOT_RELOAD=1** during local development to watch module entry points. Hot
reload is a development aid, not a substitute for startup and regression tests.

## Gamemode or module?

| Use case | Owner |
| --- | --- |
| XP rates, tutorials, progression, or required providers | [Gamemode](gamemodes.md) |
| Content required for one world identity | That gamemode |
| Optional admin/debug facility | Content module |
| Optional feature compatible with multiple worlds | Content module |
| Reusable engine or model API | Shared package, not content |

If removing the feature changes what the world *is*, it belongs to the gamemode. If it
can be enabled independently without changing persistence identity, it may be a module.

## Shared custom items

Custom item definitions shared by both runtime apps use **@august/custom-content**:

```typescript
import { CustomItemBuilder } from "@august/custom-content/items/CustomItemBuilder";
import { CustomItemRegistry } from "@august/custom-content/items/CustomItemRegistry";

CustomItemRegistry.register(
    CustomItemBuilder.create(50100)
        .basedOn(3834)
        .name("My Custom Item")
        .inventoryActions("Activate", null, null, null, "Drop")
        .build(),
    "hello-module",
);
```

Keep server-only permissions and effects in the server module. Keep browser-only
presentation in the client. The package owns only the reusable definition/loader
boundary.

## Custom widgets

Server widget registration remains server-owned:

```typescript
import { CustomWidgetRegistry } from "@server/game/scripts/CustomWidgetRegistry";

CustomWidgetRegistry.register(buildMyWidgetGroup());
```

When a widget needs a shared wire contract, add it to **@august/protocol** rather than
importing browser code into the server.

## Bundled modules

| Module | Purpose |
| --- | --- |
| **bandos-instance** | Optional Bandos encounter instance behavior |
| **item-spawner** | Permission-gated item search/spawn development UI |

## Skill content

Vanilla skills are required world content and therefore remain under:

```text
apps/server/src/content/gamemodes/vanilla/skills/
```

Leagues V inherits or customizes those handlers through its gamemode boundary; the
generic server engine does not hardcode a particular skill implementation.
