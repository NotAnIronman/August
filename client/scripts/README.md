# Client scripts

This directory contains Node-based cache exporters as well as older one-off
utilities. A file being present under `scripts/cache/` does not by itself mean
that it is a supported command.

## Maintained cache exporters

The maintained tools are the JSON exporters below. They are the bounded set
checked by `yarn --cwd client typecheck:tools`.

| Package command | Entrypoint | Output (when run from `client/`) |
| --- | --- | --- |
| `yarn --cwd client export-items [cacheName]` | `cache/export-items.ts` | `client/items/items.json` |
| `yarn --cwd client export-npcs [cacheName]` | `cache/export-npcs.ts` | `client/npcs/npcs.json` |
| `yarn --cwd client export-locs [cacheName]` | `cache/export-locs.ts` | `client/locs/locs.json` |

`cacheName` is optional. When omitted, the exporter uses the latest entry in
`server/caches/caches.json`. A supplied name must also be present in that
manifest; it may be either the bare cache directory name or `caches/<name>`.

Prerequisites:

- Node.js 22.16 or newer and the normal client dependencies (`tsx`,
  `@types/node`, and the cache-decoder dependencies from `client/package.json`).
- A validated server cache. Run `yarn --cwd server ensure-cache` first. The
  exporters read `server/caches/caches.json`, the selected cache directory,
  and its `keys.json` directly.
- Write access to the output directory. NPC and loc exports are tracked data,
  so review their diffs before keeping a regenerated file.

`cache/load-util.ts` is shared implementation for these commands, not a CLI
entrypoint.

## Package commands currently blocked

`client/package.json` also exposes these two commands, but they are not part of
the maintained tools gate because a clean install cannot run them:

| Package command | Entrypoint | Blocker |
| --- | --- | --- |
| `export-textures` | `cache/export-textures.ts` | Imports `sharp`, which is not declared or installed. |
| `export-height-map` | `cache/export-height-map.ts` | Imports `sharp`, which is not declared or installed. |

Do not add a local declaration shim for `sharp`: the scripts need its native
runtime implementation to produce PNG files. Restore these commands only by
making an explicit dependency and platform-support decision.

## Manual and historical utilities

These files have no package command and are intentionally outside the
maintained typecheck gate. They are retained as investigation history or as a
starting point for future repair.

| File | Status |
| --- | --- |
| `cache/dump-script.ts` | Manual CS2 inspection helper. It uses current cache APIs, but has no supported CLI contract or regression coverage. |
| `cache/fill-npc-sound-overrides.ts` | Blocked by the absent `mcp/lib/cache` module and its `resolveCache` API. Repository-root paths were corrected, but `mcp/` is ignored and is not available in a clean checkout. |
| `cache/generate-npc-sounds.ts` | Blocked by the same missing MCP cache adapter. It also has unresolved strict-null checks around optional sound IDs. Repository-root data paths were corrected. |
| `cache/generate-db-names.ts` | Stale against current cache APIs: it calls `Archive.getFileIds()`, uses the removed `IndexType.CONFIGS` member, and uses old `CacheSystem`/loader signatures. Reference and output root paths were corrected, but `cs2-decompiler/` and the CS2 reference tree are not present in a clean checkout. |
| `cache/parse-intermap-links.ts` | Paths now point to the repository-level `references/` and `server/data/` directories. It still requires the ignored, normally absent `references/cs2-scripts/scripts/[proc,script1705].cs2` input and has no package command. |

Historical scripts should be repaired and given an explicit package command
before being added to `tsconfig.tools.json`.
