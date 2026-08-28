# Refactor Audit and Roadmap

This document is the durable plan for making August easier to understand and safer to
extend without losing OSRS behavior, player data, or dynamically loaded content. It
summarizes the project-wide audit performed for the `Organize/Refactor` branch on
2026-08-28.

It is both an audit and a migration contract. The cache-independent validation recorded
below is green for this branch; environment-dependent and deliberately broad audit gates are
called out separately rather than being presented as completed. High-risk work is deferred
until its behavior is characterized.

Use the [Architecture](ARCHITECTURE.md) and [Project Map](PROJECT_MAP.md) for current ownership.
The [Cleanup Roadmap](CLEANUP_ROADMAP.md) retains earlier session-specific findings; this page
is the current structural refactor plan.

The governing principles are:

- **YAGNI:** remove or generalize only when there is a demonstrated consumer or problem.
- **KISS:** prefer explicit composition and ordered manifests over clever discovery.
- **DRY:** share stable behavior, not coincidentally similar code.
- **No loss:** preserving behavior and data is more important than achieving an ideal tree
  in one pass.

## Non-negotiable no-loss invariants

### Persistence identity is part of the data model

Game-mode IDs such as `vanilla` and `leagues-v` select both runtime code and persistent
storage under `server/data/gamemodes/{id}/`. The SQLite database, account records, trade
escrow, dialogue overrides, and player state all depend on that mapping.

- Do not rename a game-mode directory or ID without a versioned migration.
- Never delete ignored `game.sqlite*`, `accounts.json`, or `player-state.json` files during
  source cleanup.
- Every persistence migration needs a backup, an idempotent forward path, a rollback plan,
  and a test using a copy of representative old data.

### Static imports do not describe the whole runtime

The following are discovered or loaded by convention:

- `server/gamemodes/{id}/index.ts` through `GamemodeRegistry`
- `server/extrascripts/{id}/index.ts` through `ExtrascriptLoader`
- weapon special-attack modules through `SpecialAttackContainer`
- script handlers and game-mode providers through registries

A file with no static inbound import is not automatically dead. Directory names, entry
files, export shapes, and registration order are public runtime contracts. Vanilla handler
order is intentionally significant, so it must not be replaced by unordered folder scans.

### Runtime data and generated data are both production inputs

Large files such as `items.json`, `npcs.json`, `locs.json`, `npc-spawns.json`,
`npc-drops-wiki.json`, and generated League tables are active inputs, not cleanup debris.
Reports and unresolved/candidate files may also feed developer tools.

- Identify the producer, consumer, format, cache revision, and regeneration command before
  moving or deleting data.
- Generate to a temporary path, validate, then replace the committed snapshot atomically.
- Keep runtime logs outside `server/data`.
- Do not combine a data migration with unrelated source moves.

### Client code is shared with the server today

`client/common` and selected `client/rs` cache/definition code are compiled into the server.
Their current location is imperfect, but they cannot be treated as browser-only code until a
shared package is introduced deliberately. Protocol IDs and packet shapes must change on
both sides together.

### Compatibility beats cosmetic uniformity

Inherited Jagex/cache ports under `client/rs`, binary protocol compatibility paths, and the
active `server/src/pathfinding/legacy` implementation may look inconsistent but remain
load-bearing. Line count, naming, or the word “legacy” is not sufficient evidence for
removal.

## Implemented and validated safe changes

The current branch contains the following bounded changes. Their cache-independent automated
coverage is recorded under [Validation results](#validation-results); manual and cache-backed
verification remains explicit.

### Repository and contributor clarity

- Added a root project README, project map, and expanded architecture/setup documentation.
- Documented ownership of server data, maintenance scripts, and reference material.
- Declared Yarn Classic and Node.js versions at the root and added one root `yarn check`
  entry point.
- Added `.editorconfig` and `.gitattributes` policies that declare text/binary handling without
  forcing a repository-wide line-ending rewrite.
- Corrected the server deployment workflow path filter from the nonexistent root `src/` to
  `client/`.

### Broader verification plumbing

- Added separate TypeScript projects for server runtime, tools, and tests so the maintained
  runtime gate stays useful while broader legacy typing debt remains visible.
- Added separate client type-checking for the application, maintained tools, and tests; all
  three scopes compile on this branch.
- Replaced hand-picked test commands with a shared test-file discovery runner.
- Added a validation workflow that installs all three packages and invokes `yarn check`.
- Preserved explicit cache-dependent test commands instead of pretending those tests are
  safe in every environment.

The current runner discovers top-level `*.test.ts` files only. Either keep test directories
explicitly flat or make discovery recursive before introducing nested test suites.

### Environment, generated files, and diagnostics hygiene

- Expanded `.env.example` with documented server options and removed the hard-coded `lol,bot`
  administrator fallback. The existing tracked `.env` is intentionally retained in this branch
  so a production pull cannot delete active configuration before an external environment-file
  migration is verified.
- Expanded ignore/format exclusions for caches, generated snapshots, dependencies, and
  local logs.
- Moved runtime-probe output from tracked `server/data/runtime-probe.log` to ignored
  `server/logs/runtime-probe.log`, preserving the existing local log contents.
- Removed an obsolete duplicate sprite-name snapshot while retaining the canonical public
  catalog.

### Small, evidence-backed server cleanup

- Removed the duplicate core achievement-diary varbit table; login now applies and sends the
  game mode's single login-varbit list.
- Removed the unused, partially introduced `GameContext` rather than maintaining two service
  containers with conflicting ownership claims.
- Added constant-time weapon lookup while preserving the legacy first-match helper and
  last-match provider-map behavior for duplicate curated IDs; a regression test protects both
  contracts until the underlying data is normalized explicitly.
- Added targeted type fixes exposed by the broader compiler scope without reorganizing
  runtime domains.

### Runtime correctness fixes exposed by the audit

- Corrected invalid NPC-conversation imports in Falador and Port Sarim shops.
- Corrected key-door item-event handling, quick-prayer dispatch, and the optional Al Kharid
  door-manager path.
- Replaced mining's call to a nonexistent precheck failure function and corrected smithing,
  prayer, quest-item, widget, and equipment contracts to match their runtime data shapes.
- Updated quest test fixtures to the real `stackability` field, removing false failures without
  changing quest behavior.

### Cache setup reliability

- Extracted cache-download locking into an ownership-token implementation with heartbeat,
  double-checked stale-lock recovery, and ownership-safe release.
- Download and extraction now occur in token-owned staging paths. Publishing swaps only the
  selected cache revision, preserves unrelated revisions, and restores both the old target and
  manifest if publication fails.
- Failed, malformed, or unexpectedly empty XTEA responses now abort publication. Cache
  preflight also verifies non-empty core files, index 0, metadata, and stored key shape so an
  incomplete encrypted-map cache cannot be accepted permanently.
- Added focused regression tests for contention, replacement ownership, heartbeat, legacy
  lock recovery, stale reclamation, safe publication, and rollback.

## Validation results

The following results were recorded on 2026-08-28 against the final working-tree content:

| Gate | Result | Scope and evidence |
| --- | --- | --- |
| Diff hygiene | **Passed** | `git diff --check` reports no whitespace errors; the final diff was reviewed for tracked secrets, runtime state, and accidental generated snapshots. Git's informational Windows EOL conversion warnings are not diff errors. |
| Server runtime TypeScript | **Passed** | `tsc --noEmit -p server/tsconfig.runtime.json`, including game modes and extrascripts. |
| Client TypeScript | **Passed** | Application, test, and bounded maintained-tool projects all compile. |
| Server cache-independent tests | **Passed** | All 107 discovered top-level test files passed in isolated processes. |
| Client cache-independent tests | **Passed** | All 11 non-cache test files passed in isolated processes. |
| Documentation | **Passed** | The VitePress production build completed successfully. |
| Cache-dependent tests | **Not run** | The two server cache-ID/widget tests and the client widget-loader test require a valid `server/caches/caches.json`, which is not present in this checkout. They remain available through `test:cache` and `test:all`. |
| Runtime boot and browser smoke | **Not run** | Starting both worlds and the browser client would first download/install the missing cache. Login, movement, sync, audio, logout, and focused gameplay still require an environment with that cache. |

The default `yarn typecheck` intentionally covers the complete server runtime plus the client
application, maintained tools, and client tests. `yarn typecheck:all` is a broader debt-audit command: the server
test project still exposes pre-existing mock/import typing drift, and the server maintenance-tool
project was too resource-intensive to complete in this environment. The maintained client tool
scope is green. Two exposed image exporters are separately documented as blocked because
`sharp` is not declared or installed.

Do not “fix” a validation failure by excluding more code unless that code is proven to be an
intentional external or generated boundary.

## Deferred high-risk work

The audit intentionally did not perform the following:

- no mass client/server directory reshuffle
- no rename of game modes or persistence directories
- no deletion based only on static reachability
- no consolidation of the two client-to-server packet paths
- no rewrite of `WSServer`, `ServerServices`, or the scripting facade
- no uncontrolled auto-discovery of Vanilla content
- no broad split of `OsrsClient` or rendering code
- no conversion of generated/runtime snapshots without parity checks
- no refactor of inherited `client/rs` code solely to satisfy a line-count target

These changes have large blast radii and must be delivered as separate, characterized
migrations.

## Ranked backlog

### P0 — establish a trustworthy baseline

1. **Complete the environment-dependent gates.** Install the targeted OSRS cache, run the
   explicit cache suites, boot both worlds, and perform the browser/gameplay smoke scenarios.
   Keep the server tools/test typing debt visible through `typecheck:all` while repairing it in
   bounded follow-up changes.
2. **Add loader-contract tests.** Boot both game modes, enumerate extrascripts and special
   attacks, and assert required export/registration shapes and deterministic ordering.
3. **Add persistence migration tests.** Exercise legacy JSON import, SQLite reopening,
   game-mode isolation, trade refund recovery, and save round trips using temporary copies.
4. **Add runtime-data provenance checks.** Compare generated artifact metadata to
   `server/target.txt`. The committed NPC sound generated/override/unresolved files currently
   identify cache revision 235 while the server targets revision 237; determine whether to
   regenerate or document intentional compatibility.
5. **Migrate deployment configuration before untracking `.env`.** Copy production values to a
   service `EnvironmentFile` or secret store, verify both worlds retain their privileged-user
   configuration, and only then remove the repository file in a dedicated operations change.
6. **Keep diff noise out of semantic reviews.** Normalize inherited line endings only in a
   dedicated change; do not mix repository-wide EOL churn with behavior edits.

Exit criterion: the branch has a recorded green baseline, loader and persistence contracts
are protected, and reviewers can see semantic changes without generated or EOL noise.

### P1 — reduce central coupling behind compatibility facades

1. **Design the packet migration before changing it.** Legacy OSRS opcodes and the newer
   binary message decoder coexist. Inventory every packet, choose one canonical route, add
   byte-level golden tests, then migrate one packet family at a time. Do not rely on first-byte
   heuristics indefinitely.
2. **Thin the server composition root.** `server/src/network/wsServer.ts` constructs and wires
   most subsystems while a broad `ServerServices` interface exposes runtime and transport
   state. Extract an application bootstrap and narrow domain dependency interfaces while
   keeping a temporary compatibility adapter.
3. **Split the script contract by domain.** `scripts/types.ts`, `serviceInterfaces.ts`, and
   `ScriptServiceAdapter.ts` form a high-fan-in API. Introduce domain contracts/adapters, then
   retain the old files as barrels until every game mode and extrascript compiles and boots.
4. **Generalize instance primitives before the next bosses.** Generic instance code currently
   uses `QuestInstance*` names and constructs `SailingWorldView`. Introduce a generic world-view
   collision contract and `Instance*` types, with compatibility aliases for quest and sailing
   consumers. Keep instance lifecycle separate from encounter/boss behavior.
5. **Extract `OsrsClient` incrementally.** The client coordinator remains roughly eight
   thousand lines. Characterize and extract one controller at a time—widget events, sync,
   dialogue/chatheads, examine, audio, and lifecycle—without moving state blindly.
6. **Make extrascript reload transactional.** Invalidate nested modules, build a fresh registry,
   and swap only after successful registration. Retain the last known-good registry on failure.
7. **Remove runtime dependence on documentation.** Weapon initialization currently parses
   `docs/combat-weapons-list.md` and the full item snapshot during module load. Generate and
   validate a checked-in runtime snapshot instead, then merge a small curated override table.
   Normalize the known duplicate/name-mismatched curated item IDs against `items.json` in that
   migration; the compatibility index currently preserves both historical lookup precedences.

Exit criterion: central coordinators are thinner, dependency direction is explicit, and old
entry points remain as tested compatibility facades during migration.

### P2 — split oversized domains and clarify ownership

Prioritize mixed-responsibility application code, not pure data or faithful engine ports.

Server candidates:

- combat targeting/evaluation, effects, visuals, XP, loot, and death within
  `CombatHitProcessor`
- tick phase handlers within `TickPhaseService`
- NPC repository/spawn, spatial index, lifecycle, movement, and aggression within
  `npcManager`
- door geometry/classification versus mutable collision/state in `DoorStateManager`
- trade session state, durable escrow, transfer logic, and UI presentation in `TradeManager`
- bank model/tab mapping versus widget protocol in `BankingManager`
- packet-family encoders within `ServerBinaryEncoder` and `PlayerPacketEncoder`

Client candidates:

- widget traversal/render phases in `widgets/gl/widgetsGl/renderWidgetTree.ts`
- ECS state versus sync/view construction in `PlayerEcs` and `NpcEcs`
- frame orchestration versus map/entity rendering in `WebGLOsrsRenderer`
- packet-family decoding in `ServerBinaryDecoder`
- music/sound loading, scheduling, playback, and UI state in the audio systems

For every extraction, leave the original class as a facade, preserve call order, add
characterization tests, and avoid mixing a path move with behavior changes.

### P2 — organize paths, manifests, tests, and shared code

1. Extend `server/src/paths.ts` and remove working-directory fallback probes only after root
   and package-local launch tests exist.
2. Split `server/src/world` into cohesive collision, doors, instances, and location units using
   temporary re-exports at old paths.
3. Replace the large Vanilla index with explicit ordered domain manifests. Preserve current
   precedence for specific handlers, generic fallbacks, skills, and quests.
4. Mirror source domains under test directories or make the shared runner recursive.
5. Extract stable client/server contracts from `client/common` only after import boundaries and
   package ownership are agreed.
6. Add boundary/lint rules after the target layout is stable; the server currently has an ESLint
   config without a complete lint command/dependency setup.
7. Introduce a level-gated client logger and remove only unconditional hot-path tracing, keeping
   deliberate diagnostics and tool output.

### P3 — delete or archive only after proof

Candidates identified by the audit include unused world prototypes, duplicate spell-effect and
weapon-speed implementations, an unused server custom-item adapter island, zero-call legacy
methods, alias-only barrels, and tooling libraries stored under runtime namespaces.

Before deleting any candidate:

1. search static imports, dynamic loaders, registries, scripts, tests, docs, and ambient typing
   consumers
2. run the full typecheck and appropriate tests
3. boot both worlds where runtime discovery is involved
4. document why the file is safe to remove
5. keep an archive only when provenance or operational history has continuing value

Encounter targeting/timeline helpers, ambient declarations, pathfinding “legacy” code,
generated unresolved files, and script-only parsers are known examples that would be falsely
classified by a simple inbound-import count.

## Safe migration playbooks

### Moving a source domain

1. Characterize public behavior and import consumers.
2. Create the target module and leave a compatibility re-export at the old path.
3. Move one cohesive dependency direction at a time.
4. Update tests and docs in the same change.
5. Remove the compatibility path only after repository-wide search and a release cycle.

### Moving generated/runtime data

1. Record producer, consumer, schema, row count, checksum, and cache revision.
2. Teach readers to accept old and new paths temporarily.
3. Update the generator and documentation.
4. Regenerate to a temporary location and compare semantic output.
5. Remove the old path only after both worlds and tools consume the new location.

### Changing persistence identity or schema

1. Back up representative live data.
2. Write an idempotent migration and rollback procedure.
3. Test old, partially migrated, already migrated, and corrupt inputs.
4. Deploy reader compatibility before writer cutover where possible.
5. Never make source cleanup responsible for deleting old persistence files.

### Changing a dynamic content package

1. Preserve directory ID, entrypoint name, export contract, and handler order.
2. Add a loader test that discovers and registers the package.
3. Treat hot reload as an atomic registry swap.
4. Boot every game mode because extrascripts currently register globally.

## Definition of done

A refactor phase is complete only when:

- behavior and persisted data are unchanged or explicitly migrated
- dynamic loaders and ordered registries still discover the same content
- source, tools, and tests type-check under their declared projects
- cache-independent and applicable cache-dependent tests pass
- both configured worlds boot without new warnings or missing registrations
- relevant gameplay receives a focused smoke test
- generated artifacts have documented provenance
- documentation and the project map match the final layout
- the diff contains no unrelated formatting, line-ending, generated-data, or user-work churn

The desired end state is not the fewest files. It is a codebase where ownership is obvious,
dependencies point in one direction, behavior is protected, and the next OSRS-parity feature
has one clear place to live.
