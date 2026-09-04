# Cleanup roadmap

The repository-wide ownership migration is complete at the outer boundary. Future cleanup
should improve behavior inside those owners, not create another parallel tree.

## Completed foundation

- runtime applications live under **apps/**;
- shared code has explicit **@august/** package owners;
- server gamemodes and optional modules share **apps/server/src/content/**;
- maintenance commands are grouped under **tools/**;
- catalogs, generated artifacts, and references have separate **data/** classes;
- contributor, naming, testing, experiment, and migration policies are documented;
- pnpm owns the workspace dependency graph and CI entry points;
- repository checks enforce package, application, tool, root-layout, naming, generated-data,
  and exact-case documentation-link boundaries;
- test discovery is recursive and both runtime and test TypeScript configurations are strict;
- provider registration, script bootstrap/hot reload, content subscriptions, and player-owned
  scheduled work have explicit rollback/reset/dispose lifecycles with focused coverage;
- browser unmount/HMR owns renderer scheduling, workers, subscriptions, mobile inputs, login
  asset requests, and server probes, including cleanup after late initialization;
- SQLite bounds player-state rows to 64 MiB before parsing, validates new writes, and preserves
  transaction rollback when a state or trade-ledger write is rejected.

## Priority 0: keep the boundary enforceable

- Keep the AST-backed architecture checks green when adding a package, application, alias,
  dynamic import, or tool entry point.
- Keep TypeScript aliases aligned with physical paths; do not use aliases to disguise an
  invalid dependency.
- Require generated-data provenance and expired-experiment checks in repository
  validation.
- Keep registry/bootstrap lifecycle tests mandatory as new providers, watchers, timers,
  subscriptions, and player-session state are added.
- Make VPS deployment identify and verify the exact validated commit before restart.

## Priority 1: modernize and budget the browser build

Replace Create React App/react-scripts 5 with a maintained build pipeline through a
separate characterized migration. That work must preserve worker loading, public/subpath
assets, service-worker behavior, WebAssembly fallbacks, and production hosting headers.
Resolve the inherited dependency audit findings and TypeScript peer mismatch as part of
that migration instead of forcing incompatible transitive versions.

Keep developer-only tools outside the initial gameplay bundle and enforce a configurable
compressed main-bundle ceiling after production builds. Treat a budget increase as an
explicitly reviewed performance decision. The 2026-09-03 baseline is 3,307,379 raw bytes
and 901,564 gzip bytes for the main bundle under the current 1 MiB gzip ceiling; reduce it
rather than treating headroom as a target.

## Priority 2: reduce oversized coordinators

Continue extracting cohesive client feature controllers from
**apps/client/src/engine/game/OsrsClient.ts** and large renderer/widget coordinators. Extract
state and narrow interfaces first, add characterization tests, then move one behavior
cluster at a time.

Add cooperative cancellation to WebGL shader, water-texture, and related initialization.
The current lifecycle safely prevents restart and cleans late resources after settlement,
but does not stop the underlying initialization work immediately.

On the server, keep **apps/server/src/index.ts** and WebSocket composition focused on
wiring. Domain behavior belongs in game/network/world services with explicit
dependencies.

## Priority 3: consolidate protocol behavior

Packet identifier registries and shared message contracts now have one canonical owner
under **@august/protocol**. Continue moving any remaining family-specific codec behavior
there one packet family at a time, with byte-level golden tests and both client/server
consumers in the same change.

Do not delete a compatibility decoder because its static inbound imports are low. Prove
that every opcode family and login/runtime route has moved.

## Priority 4: finish data and state operations

- Add schemas for maintained catalogs and generated runtime datasets.
- Ensure every generator is deterministic and writes through a validated temporary path.
- Keep external references out of runtime dependency paths.
- Exercise backup, dry-run, verification, and recovery for every state migration.
- Add a SQLite-backed same-account login lease, or enforce one process per gamemode
  database, before supporting multi-process worlds and trade recovery.
- Move bounded player-state decoding off latency-sensitive runtime paths, quarantine
  malformed rows before autosave can replace them, and bound the trusted defaults file.
- Revisit WAL `synchronous=NORMAL` versus `FULL` using an explicit durability/latency target.
- Treat **apps/server/var/** as operational state with a backup policy, not disposable
  build output.

## Priority 5: harden public hosting policy

- Keep TLS/WSS termination and trusted-proxy configuration explicit and fail deployment
  checks when the advertised public endpoint does not match the intended proxy setup.
- Replace permissive origin handling with a configurable allowlist where deployments have
  a fixed browser origin, while retaining an explicit self-host compatibility mode.
- Disable or permission-gate the privileged authenticated debug packet channel outside
  trusted development environments.

## Priority 6: retire compatibility deliberately

Every compatibility adapter, old identifier, temporary report, and manual test record
needs an owner and removal condition. Remove it only when:

1. all consumers use the final boundary;
2. focused and repository-wide validation pass;
3. dynamic loaders and persistence contracts are checked;
4. documentation no longer teaches the compatibility path.

Git history is the archive for deleted experiments and obsolete implementation notes.
