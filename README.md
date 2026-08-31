# August

August is an OSRS-parity TypeScript game. Its browser client, authoritative server,
shared engine packages, tooling, data, and documentation live in one pnpm workspace.

The repository contains a browser client, a tick-based game server, shared cache and
network code, game-mode content, development tools, and the documentation site.

## Start here

Requirements: Node.js 22.16 or newer and pnpm 11.19.0 (prefer Corepack).

```bash
pnpm run setup
pnpm run prepare:data
pnpm run start
```

`pnpm run start` launches both configured server worlds and the web client. Use
`pnpm run start:vanilla` when you only want World 1 and the client.

Before handing off a change, run:

```bash
pnpm run check
```

The check command enforces repository layout, naming, and dependency direction; type-checks
all packages, maintenance tools, both applications, and both test suites; runs the
cache-independent tests; and builds the server, client, and documentation site.
`pnpm run typecheck:all` remains an alias for the same complete type contract.

## Find the right place

- [Repository overview](apps/docs/overview.md) — system map and dependency direction
- [Project map](apps/docs/project-map.md) — where each kind of change belongs
- [Architecture](apps/docs/architecture.md) — runtime flow and package boundaries
- [Contributing](CONTRIBUTING.md) — target layout, naming, tests, data, and migration rules
- [Setup guide](apps/docs/setup.md) — installation, worlds, and troubleshooting
- [Data guide](data/README.md) — catalogs, generated files, references, and schemas
- [Tool guide](tools/README.md) — maintenance command ownership
- [OSRS parity checklist](apps/docs/osrs-parity-checklist.md) — parity verification

## Non-negotiable safety rules

- Game-mode IDs (`vanilla`, `leagues-v`) are persistence keys. Do not rename them
  without a data migration.
- `apps/server/src/content/gamemodes` and `apps/server/src/content/modules`
  are loaded dynamically. A missing static import does not mean a file is unused.
- Mutable account/player databases under `apps/server/var/gamemodes/*` are ignored and
  must never be deleted as part of source cleanup.
- Cross-application models, protocol code, and inherited engine code belong in
  `packages/`; no package may import an application.
- Move one cohesive ownership boundary at a time and preserve behavior with focused tests.

The design standard is simple: YAGNI for speculative systems, KISS for control flow,
and DRY where a shared abstraction has more than one real consumer.
