# Repository tools

Scripts here are developer/operations tools, not request-time game code. Run the
named package command when one exists; it captures required preflight steps.
The `@august/tools` workspace owns their direct dependencies and their complete
typecheck. Application packages may expose domain-specific commands as ergonomic
entrypoints, but they do not own the tool implementation.

A tool may consume a declared app or package surface for generation, diagnostics, or
tests. Runtime applications never import back from `tools/`; the repository boundary
checker enforces that one-way maintenance dependency.

## Categories

| Category | Typical scripts/commands | Output |
| --- | --- | --- |
| Cache | `ensure-cache.ts`, `pnpm --filter @august/server ensure-cache` | ignored files under `apps/server/var/cache/` |
| Collision | `build-collision-cache.ts`, `pnpm --filter @august/server build-collision` | ignored collision cache |
| Runtime-data sync | `sync-osrs-npc-drops.ts`, `sync-missing-cache-items.ts`, equipment sync commands | reviewed files under `data/generated/server/` |
| Content generation | `export-league-masteries`, `export-league-tasks` | reviewed generated source under `apps/server/src/content/gamemodes/leagues-v/data/` |
| Imports | `import-osrs-equipment-reference.ts`, dialogue/examine importers | reviewed runtime or reference data |
| Audits | NPC animation/equipment audit scripts | reports; not runtime unless documented |
| Diagnostics | cache/loc/NPC tracing scripts | temporary or report output |
| Development | combat-test generators and `save-editor.html` | ignored fixtures or an explicitly exported database copy |

## Before running a script

1. Read its CLI options and output paths.
2. Confirm whether it uses the network or the local OSRS cache.
3. Check `git status` so generated changes cannot hide unrelated edits.
4. Use `tools/lib/repository-paths.ts` for repository paths; never derive them from
   the caller's current working directory.
5. Review generated diffs before committing; never assume an upstream import is safe.

Run `pnpm --filter @august/tools typecheck` when auditing these scripts. A
tool that is intentionally retired must be recorded in the nearest status manifest,
or deleted after confirming that it has no caller; Git history is the archive. It
must not remain as a silently broken command.

The cache installer streams downloaded archives to its token-owned staging area
instead of retaining the complete archive in memory. Run it only through the named
`ensure-cache` command so its lock, validation, publication, and cleanup guarantees
remain active. Shared downloads time out after 30 minutes and reject payloads larger
than 2 GiB by default; individual diagnostic callers can request tighter limits.

The TypeScript test runner uses one fresh worker thread per test by default. This
preserves isolated globals, environment changes, module caches, and exit codes without
paying for a new operating-system process for every file. Pass `--isolation=process`
only when diagnosing behavior that specifically depends on process isolation. Each test
has a 120-second deadline so CI reports the file that stalled; use
`--timeout-ms=<positive integer>` when a focused test legitimately needs a different
limit. Use `--repeat=<positive integer>` to rerun each selected file in a fresh
isolate, and `--order=reverse` to expose accidental filesystem or external-resource
coupling that survives process-local isolation.

Run `pnpm benchmark:autosave` from the repository root to measure batched persistence
with deterministic, synthetic players and full-size banks. The harness writes only to
the ignored `apps/server/var/testing/autosave-stress/` boundary. Pass overrides after
`--`, such as `--players=128`, `--iterations=10`, or `--bankFill=0.8`.

The standalone `development/save-editor.html` edits an explicitly selected SQLite copy
in browser memory and exports a new file; it never edits the live database in place.
Stop the server and make a verified backup before replacing player state. The page loads
SQL.js from cdnjs and item names from the OSRS Wiki, so use only trusted network/browser
environments for real account data.
