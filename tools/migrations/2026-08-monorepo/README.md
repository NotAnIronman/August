# 2026-08 monorepo migration

**Status:** Complete on 2026-08-29  
**Validation:** `pnpm run check`

This directory is the durable provenance for the repository-wide ownership, naming, and
consolidation migration. The migration moved runtime applications under `apps/`, extracted
shared packages, classified maintained and generated data, centralized maintenance tools,
and established automated structure, naming, and dependency-boundary checks.

## Artifacts

- `directory-name-map.json` records the mechanical directory-name changes.
- `rewrite-module-specifiers.mjs` and `rewrite-server-specifiers.mjs` performed bounded
  import-path rewrites.
- `consolidate-special-attacks.mjs` moved weapon special-attack implementations behind one
  server domain boundary.
- `normalize-generated-metadata.mjs` normalized generated-data metadata.
- `remove-dead-combat-list-loader.mjs` removed the retired duplicate combat-list loader.

These scripts are historical migration tools, not recurring repository maintenance. They
are retained so reviewers can reconstruct the change; do not rerun them on the completed
tree without reviewing their exact targets first. Rollback is by reverting the migration
change. Stable persistence identifiers and data contracts were intentionally preserved.
