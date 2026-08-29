# Repository layout

**Status:** Active contract. The outer application tree, shared packages, content
directories, tool categories, and initial data classes now exist. The table below calls
out the remaining compatibility boundaries.

A path is “migrated” only when the target exists, all imports and commands resolve
through it, validation passes, and the former path is removed or reduced to an
explicitly temporary compatibility wrapper.

## Repository layout

```text
apps/
  client/
    src/                  Browser application source
  server/
    src/content/
      gamemodes/           World identities and rules
      modules/             Optional cross-gamemode content
    resources/             Reserved server-local read-only resources
    var/                   Mutable-state boundary (ignored; created as needed)
  docs/                   Documentation application
packages/
  game-model/             App-independent domain types and rules
  protocol/               Wire contracts; may depend on game-model
  osrs-engine/            Inherited RS engine and browser adapters
  custom-content/         Reusable August-specific content
tools/
  cache/                  Cache acquisition, inspection, and export
  data/                   Import, generation, and validation
  diagnostics/            Audits and investigation tools
  migrations/             Environment and persistent-data migrations
  testing/                Test runners, fixtures, and harness utilities
  repository/             Repository policy and boundary checks
data/
  catalogs/               Reviewed canonical datasets
  generated/              Reproducible, reviewed derived datasets
  references/             External evidence and research inputs
  schemas/                Planned; created with the first versioned schema
```

## Dependency rules

- Applications may depend on packages; no package may import an application.
- **game-model** is the package base and has no application dependencies.
- **protocol** may depend only on **game-model**.
- **osrs-engine** may depend on **game-model** and **protocol**.
- **custom-content** may depend on **osrs-engine**, **protocol**, and **game-model**.
- Applications must not import another application's private source.
- Runtime code must not import **tools**. Maintenance and test tools may consume package
  APIs, repository data, and explicitly declared application internals; that direction
  never becomes an application runtime dependency.
- **data** contains data, schemas, and provenance—not executable application logic.
- A server-only resource belongs in **apps/server/resources**. A canonical or
  reproducible repository-wide dataset belongs under **data**; do not keep both.
- Mutable state, downloaded cache, logs, and temporary output belong only in
  **apps/server/var** and are never committed.
- Server-owned game modes and gameplay modules belong in
  **apps/server/src/content**, not in a new root-level content directory.

## Migration status

| Boundary | Owner | Status and rule |
| --- | --- | --- |
| Browser source | **apps/client/src/** | Migrated; new browser code stays inside the app or a public package. |
| Server runtime | **apps/server/src/** | Migrated; packages and tools must not import it. |
| Documentation | **apps/docs/** | Migrated and built through **@august/docs**. |
| Cross-app domain models | **packages/game-model/** | Migrated; keep it app-independent. |
| Shared wire contracts | **packages/protocol/** | Migrated; depends only on game-model. |
| Inherited cache/config/model/scene engine | **packages/osrs-engine/** | Migrated; may depend on game-model and protocol. |
| Reusable August-specific engine extensions | **packages/custom-content/** | Migrated; server-only content stays in the server app. |
| Game modes and optional modules | **apps/server/src/content/{gamemodes,modules}/** | Migrated; preserve dynamic discovery and persistent IDs. |
| Maintenance commands | matching **tools/** category | Migrated; each tool declares inputs, outputs, and owner. |
| Canonical and generated datasets | matching **data/** class | Migrated; each dataset still needs provenance and a named consumer. |
| Machine-readable data contracts | **data/schemas/** | Planned; create the directory only with its first versioned schema and consumer. |
| Server-local read-only files | **apps/server/resources/** | Planned; create only when a verified server-only consumer needs it. |
| State, cache, logs, and temp output | **apps/server/var/** | Active boundary; created on demand, ignored by Git, and backed up operationally. |

## Transition markers

Every retained legacy path must have one discoverable marker in its nearest README,
module header, or migration issue:

```text
Transition: compatibility -> <final path>
Owner: <person or team>
Removal condition: <testable condition or issue>
```

For source wrappers, use the same information in an **@compat** comment. A wrapper may
only delegate or re-export; it must not become a second implementation. Pull requests
must report **migrated**, **compatibility**, or **not applicable** in the template.

## Placement test

Before adding a file, answer:

1. Which single runtime, package, tool, dataset, or documentation concern owns it?
2. Who consumes it?
3. Is it source, generated output, mutable state, research, or a temporary experiment?
4. What validation proves it belongs and what event removes it?

If two locations appear valid, the boundary is unresolved. Fix the ownership boundary
instead of copying the file.
