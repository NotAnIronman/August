# Texture cache formats

Texture loader selection follows the cache format, not a new/old quality label:

- `SpriteTextureLoader` reads sprite-backed Old School and early RuneScape
  texture definitions.
- `EmbeddedMaterialProceduralTextureLoader` reads procedural definitions whose
  material metadata is embedded in the texture archive.
- `ProceduralTextureLoader` reads procedural definitions paired with a separate
  materials index.

The former age-based loader name was removed after all repository consumers
migrated. New code must use the format-specific embedded-material name; there
is no parallel compatibility implementation or export alias.
