# Client cache tools

These are repository tools owned by the client/cache domain. They live outside
the browser application so they cannot accidentally become runtime imports.
All paths are resolved from the repository root; commands do not depend on the
current working directory.

`status.json` is the machine-readable inventory for this directory. A tool is
maintained only when it has a supported package command, participates in the
tools typecheck, and names its generated output.

## Maintained exporters

| Command | Entrypoint | Generated output |
| --- | --- | --- |
| `pnpm --filter @august/client export-items [cacheName]` | `export-items.ts` | `data/generated/cache/items.json` |
| `pnpm --filter @august/client export-npcs [cacheName]` | `export-npcs.ts` | `data/generated/cache/npcs.json` |
| `pnpm --filter @august/client export-locs [cacheName]` | `export-locs.ts` | `data/generated/cache/locs.json` |

`cacheName` is optional. Without one, the exporters select the latest entry in
`apps/server/var/cache/osrs/caches.json`. A supplied cache must also be listed in that
manifest. `load-util.ts` is shared implementation, not a command.

Review generated diffs before committing them. Generated cache snapshots are
never canonical hand-edited catalogs; their artifact contract is documented in
`data/generated/cache/manifest.json`.

Only the commands in the table are supported. Unsupported experiments and
orphaned scripts are removed once their callers are gone; Git history is the
archive. Add another exporter only when it has deterministic inputs and outputs,
a package command, and typecheck coverage recorded in `status.json`.
