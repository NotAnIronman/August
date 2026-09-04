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

`pnpm run start` prepares shared runtime data once, then launches both configured
server worlds and the web client. Use `pnpm run start:vanilla` when you only want
World 1 and the client. The standalone `pnpm run server` and `pnpm run client`
commands perform their own required preparation.

## Host a world for friends

With the server running, open `http://localhost:43594/hosting` on the host
computer. The private dashboard shows the exact LAN address, connected character
names, and the public-host checklist. For TLS behind a same-host reverse proxy,
prefer one authoritative endpoint such as `PUBLIC_WS_URL=wss://play.example.com`.
For direct port forwarding, set `PUBLIC_HOST` to the public IP or DNS name you plan
to share, forward TCP port `43594` to this computer, and allow that port through its
firewall. The dashboard is intentionally not available to LAN or internet clients.

To let friends load the browser client from your own server, build it once with
`pnpm --filter @august/client build`, then start the game server normally. They
can open `http://YOUR_PUBLIC_IP:43594` directly. The server hosts the compiled
client and supplies its matching public game address automatically. Use this
HTTP/`ws://` path only for controlled temporary testing. A public deployment should
terminate TLS at a reverse proxy and advertise its `wss://` endpoint.

Before handing off a change, run:

```bash
pnpm run check
```

The check command enforces repository layout, naming, dependency direction, generated-data
portability, and exact-case documentation links; type-checks all packages, maintenance
tools, both applications, and both test suites; runs the cache-independent tests; and
builds the server, client, and documentation site. The client build also rejects
production source maps and enforces its reviewed compressed main-bundle budget.
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
