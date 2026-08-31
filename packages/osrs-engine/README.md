# `@august/osrs-engine`

The inherited RuneScape engine: cache codecs and stores, definitions, models, scene
primitives, audio, and environment-neutral utilities. Browser-owned CS2 handlers remain in
the client. This package may depend on `@august/game-model` and `@august/protocol`; it may not
import an application or custom-content package.

Purpose-specific domains include `geometry` for facing-angle conversion,
`graphics/color` for the engine's packed HSL/RGB palette rules, `cache/hashing`
for cache-name and CRC algorithms, `scene/terrain` for procedural terrain
height generation, `audio/cache-synthesis` for instrument/envelope cache sound
effects, and format-named texture loaders documented in
`src/texture/README.md`. The former generic/age-based subpaths were removed
after repository consumers migrated; there is no compatibility implementation
or package-export surface to extend.
