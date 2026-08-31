# Server command boundary

Chat transport code parses the `::name args` envelope once and calls
`resolveCommand`. That is the only command-name dispatch boundary:

1. Built-in server commands resolve from `BuiltinCommandCatalog`.
2. Content commands resolve from metadata-bearing `ScriptRegistry` entries.
3. The resolved metadata is permission-checked before any handler runs.
4. `::help` combines both catalogs and filters hidden/inaccessible entries.

Every content registration must declare `permission` and `owner`. `owner`
names the domain responsible for behavior and tests; it is not a source-file
path. Developer/admin tooling must never rely on a name appearing in a second
permission table. Use `hidden: true` for protocol plumbing that remains
callable but should not clutter player-facing discovery.

Command handlers stay beside their content (quests, sailing, developer UI,
etc.). The registry and dispatch policy live here so adding discoverability or
access control never requires moving game content into the network layer.
