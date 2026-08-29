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
  imports that cross application or maintenance-tool boundaries. It parses every
  JavaScript/TypeScript module under `apps/*/src` and detects private aliases
  (`@client`, `@server`), private application package names, direct app-source paths,
  relative cross-app paths, and tooling imports (`@tools`, `@august/tools`, direct,
  absolute, or relative paths).
- `check-package-boundaries.mjs` enforces package dependency direction, public
  exports, declared dependencies, and application/package separation.

Run both with `pnpm check:structure && pnpm check:boundaries`. CI runs them through
the root `pnpm check` gate.

Application tests remain deliberate integration consumers: top-level `apps/*/tests`
directories are outside the runtime scan, and colocated `.test.*`, `.spec.*`,
`tests/`, or `__tests__/` source files are explicitly exempt. Validate the import
parser and every forbidden path form with:

```text
node tools/repository/application-import-boundaries.test.mjs
```
