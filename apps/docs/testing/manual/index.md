# Manual test records

Manual records preserve observations that have not yet become automated regressions.
They are evidence and work queues, never runtime configuration.

- [NPC encounters](npc-encounters.md) records spawn, coordinate, and encounter checks.
- [Special attacks](special-attacks.md) records activation and hit-behavior checks.

Each record states its status, owner, date, validation meaning, and exit condition.
Revalidate an observation after its owning system changes, promote stable behavior into
an automated test, and remove resolved notes so this area does not become an archive of
orphaned work.

Put transient screenshots, logs, and raw output in an ignored temporary directory. See
the [testing policy](../../contributing/testing.md) for the required record fields and
validation levels.
