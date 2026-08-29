# FAQ

## General

### Is there a hosted version I can play?

No. August is currently self-hosted: clone the repository and follow the
[setup guide](setup.md).

### What cache version is supported?

The target is recorded in **apps/server/target.txt**. The cache tool downloads and
validates that revision from OpenRS2 during **pnpm run prepare:data**.

### Where should I put a change?

Use the [project map](project-map.md). Application-private code stays in its app,
cross-application APIs belong in the correct package, maintenance commands belong under
**tools/**, and data must be classified before it is committed.

### Can I contribute?

Yes. Read the repository-root **CONTRIBUTING.md**, run **pnpm run check**, and describe
the final owner and migration state in the pull request.

## Gamemodes

### Should I extend BaseGamemode or VanillaGamemode?

Extend **VanillaGamemode** when the new mode keeps the normal OSRS systems and changes
selected rules. Start from **BaseGamemode** only when the mode deliberately supplies its
own providers and content.

### How do I run a different gamemode?

Add the world/gamemode mapping and a unique port to **apps/server/config.json**, then run:

```bash
pnpm --filter @august/server start:world -- --world=<world-id>
```

The bundled worlds are World 1 (Vanilla) and World 2 (Leagues V).

### Can I reuse Vanilla providers?

Yes. Import the required public provider from
**apps/server/src/content/gamemodes/vanilla/** and register it during initialization.
Prefer one explicit provider over inheriting unrelated world behavior.

### Where is player data stored?

Each stable gamemode ID owns isolated mutable state under
`apps/server/var/gamemodes/<id>/`. State is ignored and must be backed up before a
migration. Never rename a gamemode directory as source cleanup.

## Content modules

### Where do legacy extrascripts belong?

The same optional-content concept now has an explicit owner:
`apps/server/src/content/modules/<id>/`. A module exports **register()** and can attach
commands or interactions to compatible worlds. Required world identity and progression
remain in a gamemode. See [Content modules](content-modules.md).

## Custom content

### How do I add a shared custom item?

Use the public builders under **@august/custom-content/items/**. Server-only registration
or behavior stays in the server app; browser presentation stays in the client app.

### How does gamemode content reach the client?

The gamemode can provide a content-data payload through **GamemodeDefinition**. The
server sends it during login and the browser applies it through the shared protocol and
custom-content boundaries. Add a shared contract rather than a second ad-hoc packet.

## Development

### How do varps and varbits work?

Varps are player variables; varbits are bit ranges within a varp. The server owns their
authoritative values and transmits changes. Client engine scripts react to those values
to update interfaces. Shared identifiers belong in **game-model** or **protocol**, while
server mutation and browser presentation stay app-local.
