# Repository architecture and reliability audit

- **Migration audit:** 2026-08-29
- **Last contract review:** 2026-09-03
- **Scope:** Ownership, naming, package boundaries, tools, data, documentation,
  portability, runtime foundations, and repository operations

This document records the invariants, current automated contract, and known remaining
risks of the August monorepo. It is not a promise that every subsystem is finished, nor
is it a substitute for validation results attached to the commit being reviewed.

## Ownership result

| Concern | Authoritative owner |
| --- | --- |
| Browser application | **apps/client/src/** |
| Server runtime | **apps/server/src/** |
| Documentation application | **apps/docs/** |
| Domain models | **packages/game-model/** |
| Wire contracts | **packages/protocol/** |
| Inherited OSRS engine | **packages/osrs-engine/** |
| Shared August engine extensions | **packages/custom-content/** |
| Gamemodes and optional modules | **apps/server/src/content/{gamemodes,modules}/** |
| Maintenance commands and repository policy | **tools/{cache,data,diagnostics,lib,migrations,repository,testing}/** |
| Reviewed and generated data | **data/{catalogs,generated,references}/** |
| Mutable server state | **apps/server/var/**, ignored and externally backed up |

## No-loss invariants

### Persistence identity

Game-mode IDs, database schema versions, save keys, trade recovery records, and account
identity are data contracts. A source move must not rename them. A schema/path change
requires a versioned tool migration, verified backup, dry run, invariant check, and
recovery plan.

### Dynamic content

Gamemodes and content modules are discovered by convention. Directory ID, entry-file
name, export shape, and registration order are runtime APIs even when no static import
points at them.

### Runtime data

Large catalogs and generated snapshots are active inputs until their consumers prove
otherwise. Every move preserves the producer, consumer, cache/source revision, schema,
provenance, and regeneration command.

### Package direction

- applications may import packages;
- packages never import applications;
- protocol may depend on game-model;
- osrs-engine may depend on game-model and protocol;
- custom-content may depend on game-model, protocol, and osrs-engine;
- runtime applications never import tools;
- one application never imports another application's private source.

### Environment safety

The local **.env** stays untracked and unchanged. Credentials, mutable databases,
downloaded cache, logs, locks, and temporary output never enter Git.

## Validation contract and evidence

The 2026-08 migration established:

- one root **pnpm-lock.yaml** and a frozen workspace dependency graph;
- boundary validation for deleted roots, obsolete lockfiles, retired package paths,
  runtime-to-tool imports, package-to-application imports, and private cross-app imports;
- no unexplained compatibility bucket, temporary source tree, or orphaned root artifact.

The 2026-09 contract review directly verified the repository structure, naming, package
boundaries, generated-data portability, exact-case local documentation links, their
regression fixtures, and a production documentation build. The server and client runtime
tranches also maintain focused typecheck and regression evidence. Test-file counts are
deliberately not frozen here: discovery is recursive and a growing suite would make a
hard-coded count stale immediately.

The release gate remains **pnpm run check** on the final integrated tree. It re-runs every
repository contract, complete runtime and test typechecks, cache-independent suites, and
production server, browser, and documentation builds. Passing a focused command earlier
in a multi-part audit is not a substitute for that final gate.

The default suite excludes the explicitly classified cache-dependent tests. Run
**pnpm run test:cache** after **pnpm run prepare:data** and record the cache revision.
Interactive boot, login, rendering, and multiplayer checks remain branch-acceptance steps
because a build cannot prove those visual and operational behaviors.

## Closed findings from the 2026-09 review

- Script providers now register transactionally: partial registration rolls back owned
  handlers and resources, and reload/reset disposes them in reverse order. Player logout
  cancels player-owned scheduled work, while content subscriptions and session collections
  have explicit lifecycle owners. The script bootstrap owns its recursive watcher,
  debounce timer, runtime reset, strict-startup rollback, and
  an idempotent `dispose()` handle. The stable provider registry also has an explicit reset
  used by gamemode teardown. Focused lifecycle tests cover these contracts.
- Browser mount/unmount and HMR paths now own their renderer scheduling, worker pools,
  plugin/network subscriptions, mobile inputs, login asset requests, and server probes.
  Late startup continuations are gated after disposal and late renderer initialization is
  cleaned after it settles.
- SQLite rejects new player-state JSON above 64 MiB and selects only text rows within that
  bound before parsing. Oversized and non-text rows are skipped, and transaction rollback
  preserves the preceding state and trade ledger when a bounded write is rejected.
- The production browser artifact check now enforces a 1 MiB gzip ceiling. The reviewed
  main bundle measured 3,307,379 raw bytes and 901,564 gzip bytes on 2026-09-03. Passing
  the ceiling is a regression guardrail, not evidence that the bundle is small.

## Known deferred risks

- The browser still builds through Create React App/react-scripts 5. Its inherited audit
  findings and TypeScript peer-version mismatch need a characterized migration to a
  maintained build pipeline; forced transitive overrides are not an acceptable shortcut.
  The approximately 901 KB gzip main bundle remains a meaningful startup cost despite the
  new ceiling and lazy developer controls.
- WebGL shader and water initialization do not expose true cancellation. Unmount now
  prevents a late frame loop and reclaims resources after initialization settles, but the
  underlying work can continue temporarily.
- Login reservations and live trade ownership are process-local. Deployments running more
  than one process against the same gamemode database need a SQLite-backed login lease or
  an enforced single-process policy; otherwise duplicate loads, last-writer-wins saves, and
  cross-process escrow recovery remain possible.
- SQLite player-state parsing is bounded to 64 MiB but remains synchronous. Malformed
  in-bound JSON falls back without quarantine and may later be overwritten; the trusted
  defaults JSON path is outside this row bound. WAL with `synchronous=NORMAL` preserves
  consistency but can lose the newest committed transactions on an OS or power failure.
- Production TLS/WSS termination remains an operator/reverse-proxy responsibility. The
  permissive origin policy supports self-hosting, and the authenticated debug packet
  channel is intentionally privileged; public deployments must restrict or disable both
  where their trust model requires it.
- The VPS deployment command does not yet prove that the remote service activated the
  exact validated Git commit. Add a deployment-SHA handshake before treating it as a
  reproducible release pipeline.

Track these items in the [cleanup roadmap](cleanup-roadmap.md).

## Definition of done

A repository change is ready when a contributor can identify one owner for every file,
commands and CI resolve only current paths, generated artifacts are reproducible,
mutable state is protected, tests describe behavior rather than layout, and no
documentation points back to a removed tree. This is a continuously enforced contract,
not a one-time declaration that future cleanup is unnecessary.
