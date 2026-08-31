# References

This directory holds external research and bootstrap sources. Reference material is
not authoritative game data until a reviewed import/generator produces a file under
`server/data/`.

Most local exports are ignored because they are reproducible or too large. The
tracked `npc-drops-wiki.json` is an intentional bootstrap fallback used by drop-data
tooling and must not be deleted as ordinary cleanup.

For a new reference source, document its origin, retrieval date, license/usage
constraints, generator or importer, and expected checksum when practical. Never put
credentials, mutable player data, or runtime logs here.
