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
