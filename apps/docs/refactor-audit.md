# Repository migration audit

**Audit date:** 2026-08-29  
**Scope:** Ownership, naming, package boundaries, tools, data, documentation, and
repository operations

This document records the invariants and evidence expected from the August monorepo
migration. It is not a substitute for the validation results attached to the migration
pull request.

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

## Recorded automated closure evidence

The completed migration records:

- one root **pnpm-lock.yaml** and a frozen workspace dependency graph;
- a successful **pnpm run check**, including repository structure, naming, package and
  application boundaries, strict package/application/test typechecks, 128 server test
  files, 17 client test files, and production server, browser, and documentation builds;
- boundary validation for deleted roots, obsolete lockfiles, retired package paths,
  runtime-to-tool imports, package-to-application imports, and private cross-app imports;
- no unexplained compatibility bucket, temporary source tree, or orphaned root artifact.

The normal check intentionally excludes three cache-dependent tests when
**apps/server/var/cache/osrs/caches.json** is absent. Run **pnpm test:cache** after preparing
that operational cache. A safe manual boot/login smoke test for each configured world is
also a branch-acceptance step; it was not run during the migration because repository
policy prohibits starting the local applications in an automated coding session.

## Deferred design work

The migration consolidated command dispatch and help metadata, weapon special attacks,
pathfinding ownership, package protocol registries, and catalog locations while preserving
their behavior contracts. Large client coordinator extraction, renderer decomposition,
deeper packet-family codec consolidation, and further server service splits remain
separate characterized changes. Track them in the [cleanup roadmap](cleanup-roadmap.md).

## Definition of done

Organization is complete when a contributor can identify one owner for every file,
commands and CI resolve only current paths, generated artifacts are reproducible,
mutable state is protected, tests describe behavior rather than layout, and no
documentation points back to the removed tree.
