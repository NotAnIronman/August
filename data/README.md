# Data architecture

This is the repository's only source-controlled data root. Data is grouped by
lifecycle so generated runtime input, reviewed configuration, research evidence,
and disposable reports cannot be confused with mutable server state.

## Data classes

| Class | Examples | Source-control policy |
| --- | --- | --- |
| Runtime snapshots | `generated/server/` | Commit; server behavior depends on them |
| Browser cache exports | `generated/cache/` | Commit only when required by the browser build |
| Generated reports | `generated/reports/` | Review aids only; runtime must not import them |
| Hand-maintained catalogs | `catalogs/server/`, `catalogs/client/` | Commit and review carefully |
| External evidence | `references/` | Preserve provenance; runtime must not import it |
| Mutable state and caches | `../apps/server/var/` | Ignore; back up before state migrations |

## Rules

- Resolve server paths through `apps/server/src/paths.ts`; do not rely on the caller's
  working directory.
- A generated file needs a known generator and a runtime consumer. If either is
  unknown, classify it as research until proven otherwise.
- Do not hand-edit large imported snapshots unless the file is explicitly an override.
- Never delete or rename a game-mode state directory as source cleanup. The directory
  name is part of the persistence key.
- Keep downloads and partial output in temporary paths, validate them, then replace a
  committed/runtime snapshot atomically.
- Run `pnpm check:generated` before committing generated JSON. It rejects invalid JSON
  and machine-specific absolute paths embedded by local generators. It does not yet
  prove provenance, deterministic regeneration, schema validity, or consumer semantics;
  those requirements still need human review under the contract above.

The tracked item, NPC, location, spawn, shop, sound, and drop snapshots are
intentional. See `tools/README.md` for their generators and maintenance commands.
