# Client catalogs

Reviewed client-facing catalogs live here when they are authored or updated by
more than one application. They are source data, not build output.

`sprite-names.json` is the canonical cache-sprite name registry. The server-side
developer command updates it through `SpriteNameCatalogFile`; the client Webpack
configuration watches it and emits `/spriteNames.json` for both development and
production. Do not recreate a second editable copy under `apps/client/public`.
