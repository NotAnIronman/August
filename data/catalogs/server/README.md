# Server catalogs

These files are reviewed runtime inputs owned by the authoritative server. Runtime
readers resolve them through `serverCatalogPath()` or the `@august/data` alias; no
consumer may keep a second application-local copy.

| Catalog | Purpose | Owner and provenance | Consumer |
| --- | --- | --- | --- |
| **doors.json** | Door definitions and collision behavior | Reviewed cache/content overrides | `DoorCatalogFile` |
| **ground-item-spawns.json** | Vanilla static ground-item placements | Maintained world-content definitions; rows are validated before registration | `groundItemSpawns.ts` and quest regression tests |
| **music-regions.json** | Region-to-track mapping and display names | OSRS Wiki music map, reviewed as one canonical snapshot | `MusicRegionService` |
| **npc-sounds.overrides.json** | Human-reviewed NPC sound exceptions | Manual overrides layered over generated sound data | `NpcSoundLookup` and data tools |
| **projectile-params.json** | Projectile timing/height overrides | Reviewed combat presentation catalog | projectile data readers |
| **dialogue-imports/** | Reviewed imported dialogue inputs | Import-tool output awaiting content integration | dialogue import/runtime owners |

Edit a catalog only with its owning validation. Reproducible derivations belong under
`data/generated/`; external source captures belong under `data/references/`.
