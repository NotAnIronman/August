# August

August is an OSRS-parity game built on the XRSPS TypeScript engine. The `@xrsps/*`
package names are inherited engine identifiers; **August is the product and fork**.

The repository contains a browser client, a tick-based game server, shared cache and
network code, game-mode content, development tools, and the documentation site.

## Start here

Requirements: Node.js 22.16 or newer and Yarn Classic (v1).

```bash
yarn setup
yarn start
```

`yarn start` launches both configured server worlds and the web client. Use
`yarn start:vanilla` when you only want World 1 and the client.

Before handing off a change, run:

```bash
yarn check
```

The check command type-checks the client application, maintained exporters, test contracts,
and the complete server runtime (including dynamically loaded content), runs the
cache-independent test suite, and builds the documentation site. The broader
`yarn typecheck:all` command also audits server maintenance tools and legacy server test
typings; known debt from that audit is tracked in the refactor roadmap.

## Find the right place

- [Project map](docs/PROJECT_MAP.md) — where each kind of change belongs
- [Architecture](docs/ARCHITECTURE.md) — runtime flow and dependency boundaries
- [Setup guide](docs/setup.md) — installation, worlds, and troubleshooting
- [Server data guide](server/data/README.md) — committed data versus mutable state
- [Server tools guide](server/scripts/README.md) — maintenance command ownership
- [OSRS parity checklist](docs/OSRS_PARITY_CHECKLIST.md) — parity verification

## Non-negotiable safety rules

- Game-mode IDs (`vanilla`, `leagues-v`) are persistence keys. Do not rename them
  without a data migration.
- `server/gamemodes` and `server/extrascripts` are loaded dynamically. A missing
  static import does not mean a file is unused.
- Mutable account/player databases under `server/data/gamemodes/*` are ignored and
  must never be deleted as part of source cleanup.
- `client/common` and parts of `client/rs` are imported by the server. Treat them as
  shared code until they are deliberately extracted into a standalone package.
- Prefer small, tested moves over broad folder reshuffles. Preserve behavior first.

The design standard is simple: YAGNI for speculative systems, KISS for control flow,
and DRY where a shared abstraction has more than one real consumer.
