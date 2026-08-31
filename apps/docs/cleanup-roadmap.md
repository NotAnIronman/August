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
- repository checks enforce package, application, tool, root-layout, and naming boundaries;
- test discovery is recursive and both runtime and test TypeScript configurations are strict.

## Priority 0: keep the boundary enforceable

- Keep the AST-backed architecture checks green when adding a package, application, alias,
  dynamic import, or tool entry point.
- Keep TypeScript aliases aligned with physical paths; do not use aliases to disguise an
  invalid dependency.
- Require generated-data provenance and expired-experiment checks in repository
  validation.

## Priority 1: reduce oversized coordinators

Continue extracting cohesive client feature controllers from
**apps/client/src/engine/OsrsClient.ts** and large renderer/widget coordinators. Extract
state and narrow interfaces first, add characterization tests, then move one behavior
cluster at a time.

On the server, keep **apps/server/src/index.ts** and WebSocket composition focused on
wiring. Domain behavior belongs in game/network/world services with explicit
dependencies.

## Priority 2: consolidate protocol behavior

Packet identifier registries and shared message contracts now have one canonical owner
under **@august/protocol**. Continue moving any remaining family-specific codec behavior
there one packet family at a time, with byte-level golden tests and both client/server
consumers in the same change.

Do not delete a compatibility decoder because its static inbound imports are low. Prove
that every opcode family and login/runtime route has moved.

## Priority 3: finish data and state operations

- Add schemas for maintained catalogs and generated runtime datasets.
- Ensure every generator is deterministic and writes through a validated temporary path.
- Keep external references out of runtime dependency paths.
- Exercise backup, dry-run, verification, and recovery for every state migration.
- Treat **apps/server/var/** as operational state with a backup policy, not disposable
  build output.

## Priority 4: retire compatibility deliberately

Every compatibility adapter, old identifier, temporary report, and manual test record
needs an owner and removal condition. Remove it only when:

1. all consumers use the final boundary;
2. focused and repository-wide validation pass;
3. dynamic loaders and persistence contracts are checked;
4. documentation no longer teaches the compatibility path.

Git history is the archive for deleted experiments and obsolete implementation notes.
