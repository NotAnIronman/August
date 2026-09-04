# Contributing to August

August uses explicit **apps/**, **packages/**, **tools/**, and **data/** ownership.
The outer application move is complete; some app internals retain compatibility markers
until every consumer has moved to its final package, content, resource, or data boundary.

## Read before changing

- [Repository layout](apps/docs/contributing/repository-layout.md)
- [Naming standard](apps/docs/contributing/naming.md)
- [Testing policy](apps/docs/contributing/testing.md)
- [Data and generated artifacts](apps/docs/contributing/generated-data.md)
- [Experiments and temporary work](apps/docs/contributing/experiments.md)
- [Environment and data migrations](apps/docs/contributing/environment-and-migrations.md)
- [Local setup](apps/docs/setup.md)

## Workflow

1. Give the change one primary owner: an app, package, tool category, dataset class, or
   documentation area.
2. Search static imports, dynamic loaders, string paths, commands, deployment references,
   persisted keys, and documentation before moving or renaming anything.
3. Keep behavior changes separate from mechanical moves where practical. Do not leave a
   duplicate implementation; a temporary adapter must declare its target, owner, and
   removal condition.
4. Add or update tests at the owning boundary. Bug fixes require a regression.
5. Run focused validation while developing and **pnpm run check** before handoff. The
   check covers layout, naming, dependency boundaries, generated-data and documentation
   portability, types, tests, builds, and the browser artifact budget.
6. Complete the pull-request template with command results, transition state, data impact,
   and cleanup lifecycle.

Use the repository **.editorconfig** and formatting configuration. Every governed path
follows the naming standard; run **pnpm run check:naming** while moving or adding files.

## Safety

- Never commit or expose **.env**, credentials, account databases, player state, logs, or
  cache stored as mutable runtime state.
- Do not rename game-mode IDs, persistence keys, protocol identifiers, or cache symbols
  without an explicit migration.
- Treat dynamically loaded content as live even when static import search finds nothing.
- Generated data needs provenance, a deterministic generator, validation, and consumers.
- Root-level scratch files are not allowed. Use ignored temporary space or a governed
  experiment with an expiry.
- Preserve a restorable backup before any state migration.

## Ready for review

A pull request is ready when its final owner is unambiguous, the compatibility status is
honest, relevant validation passes, generated/data changes are reproducible, and every
temporary file or adapter has a removal condition.
