# Client runtime architecture

Browser runtime code lives only in this directory. Imports use `@client/*` so
file moves remain explicit and cross-domain dependencies are searchable.

| Domain | Responsibility |
| --- | --- |
| `app/` | Composition root, application shell, startup, global styles, and app-wide hooks. |
| `core/` | Browser infrastructure shared by multiple domains: network, cache access, storage, input, workers, platform adapters, and ambient types. |
| `engine/` | Game simulation, CS2 execution, audio, camera, and rendering internals. |
| `features/` | User-facing capabilities grouped by endpoint or workflow, such as login, chat, combat, trade, plugins, and collection log. |
| `ui/` | Reusable presentation components, widget primitives, fonts, and general UI runtime code. |
| `assets/` | Source-controlled runtime media imported by application code. |
| `dev/` | Diagnostics and development-only controls. Production domains must not depend on this directory. |

## Dependency rules

- `app` may compose every runtime domain.
- `features` may use `core`, `engine`, and `ui`; features do not reach into one
  another's internals. Promote genuinely shared behavior to the owning lower
  domain.
- `ui` stays presentation-focused. It may use `core` contracts but does not own
  game rules.
- `engine` may use `core` and shared `@august/*` packages. The game loop and
  renderer may invoke explicit `features` and `ui` lifecycle adapters; lower
  engine primitives remain independent of presentation.
- `core` does not import `features`, `ui`, or `app`.
- Repository tools use `@tools/*` and remain outside this browser source tree.
- Generated snapshots live under `data/generated`; mutable source catalogs live
  under `data/catalogs`.

Use descriptive kebab-case folder names for domains/features and retain the
existing PascalCase convention for exported classes and React components.
Numbered filenames are permitted only when the number is part of an external
cache/protocol identity; otherwise prefer a role-based name.
