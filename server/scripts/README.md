# Server Maintenance Scripts

Scripts here are developer/operations tools, not request-time game code. Run the
named package command when one exists; it captures required preflight steps.

## Categories

| Category | Typical scripts/commands | Output |
| --- | --- | --- |
| Cache | `ensure-cache.ts`, `yarn ensure-cache` | ignored OSRS cache files |
| Collision | `build-collision-cache.ts`, `yarn build-collision` | ignored collision cache |
| Runtime-data sync | `sync-osrs-npc-drops.ts`, `sync-missing-cache-items.ts`, equipment sync commands | reviewed files under `server/data/` |
| Imports | `import-osrs-equipment-reference.ts`, dialogue/examine importers | reviewed runtime or reference data |
| Audits | NPC animation/equipment audit scripts | reports; not runtime unless documented |
| Diagnostics | cache/loc/NPC tracing scripts | temporary or report output |

## Before running a script

1. Read its CLI options and output paths.
2. Confirm whether it uses the network or the local OSRS cache.
3. Check `git status` so generated changes cannot hide unrelated edits.
4. Prefer `serverPath()`/`clientPath()` from `server/src/paths.ts` for cross-package
   paths.
5. Review generated diffs before committing; never assume an upstream import is safe.

The runtime gate deliberately stays bounded; use `yarn --cwd server typecheck:tools`
when auditing these scripts. A tool that is intentionally retired should move to a
documented research archive or be deleted with evidence; it must not remain as a
silently broken command.
