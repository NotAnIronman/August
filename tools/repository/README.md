# Repository checks

Run `node tools/repository/check-package-boundaries.mjs` from the repository root to verify
the shared package dependency order:

```text
game-model <- protocol <- osrs-engine <- custom-content
```

A package may depend only on layers to its left. The check also rejects imports from
`apps/*`, relative imports that escape a package, undeclared dependencies, missing public
subpaths, workspace dependency cycles, malformed source-package exports, and incoherent
package TypeScript settings.
# Repository enforcement

These checks turn the documented architecture into executable policy:

- `check-repository-structure.mjs` rejects obsolete roots, split runtime-state
  locations, alternative lockfiles, missing architectural boundaries, and runtime
  imports that cross application or maintenance-tool boundaries. It also rejects
  tracked root-level scratch files, archives, databases, and standalone HTML tools
  that lack a governed owner. It parses every
  JavaScript/TypeScript module under `apps/*/src` and detects private aliases
  (`@client`, `@server`), private application package names, direct app-source paths,
  relative cross-app paths, and tooling imports (`@tools`, `@august/tools`, direct,
  absolute, or relative paths).
- `check-package-boundaries.mjs` enforces package dependency direction, public
  exports, declared dependencies, and application/package separation.
- `check-generated-data.mjs` parses every JSON file currently present under
  `data/generated/` and rejects machine-specific absolute paths that would make output
  non-portable or disclose a contributor's workstation layout. This is a syntax and
  portability check only; provenance, deterministic regeneration, schema/domain
  invariants, and consumer review remain the documented review policy until each data
  family has a machine-readable manifest and schema.
- `check-documentation-links.mjs` resolves local Markdown links with the exact spelling
  stored on disk. It rejects missing targets, Windows-only backslash links, paths that
  escape the repository, and case mismatches that would fail on Linux.
- `check-client-build-artifacts.mjs` rejects production source maps and fails when the
  gzip-compressed main browser bundle exceeds 1 MiB. Set
  `CLIENT_MAIN_GZIP_LIMIT_BYTES` only when an intentionally reviewed budget differs.

Run the complete policy suite with `pnpm check:repository`. CI also runs it through
the root `pnpm check` gate.

Application tests remain deliberate integration consumers: top-level `apps/*/tests`
directories are outside the runtime scan, and colocated `.test.*`, `.spec.*`,
`tests/`, or `__tests__/` source files are explicitly exempt. The complete policy suite
also runs regression tests for the application-import parser, documentation-link
resolver, client artifact budget, and equivalent root/client-root deployment headers.
Run those focused contract tests with:

```text
pnpm test:repository
```
