# Project carryover — August

## Purpose

This project is a TypeScript RuneScape-like game/client. It uses the live OSRS cache for client assets and models, server-side game data in `server/data`, and a custom UIKit for new interfaces. The immediate goal is a stable, cache-faithful game UI and data pipeline before the next large feature overhaul.

The workspace may be a dirty worktree. Preserve changes unrelated to the task; do not reset or checkout files wholesale.

## Current user priorities

1. Keep existing UIKit work stable—do not make broad speculative UI changes.
2. Complete and validate equipment stats, NPC drops, quest UI scrolling, and cape rendering.
3. Prefer cache data / evidence over guessed sprite or model IDs.
4. Work one subsystem at a time and test the actual running path before declaring it fixed.

## Most recent implementation work

### Quest list scrollbar

The quest-panel list is cache interface `399`:

- Dynamic row list / scroll owner: `399:7`
- Original cache scrollbar host: `399:5`

The last known-good version used `399:5` to draw the rail while `399:7` owned `scrollY`. It was functional but about 25 px too far left.

Current changes restore that ownership model and apply only a 25 logical-pixel horizontal adjustment to the host-rendered rail:

- `client/widgets/custom/questList.ts`
  - `399:7` has `uikitScrollbar = false`.
  - `399:5.uikitScrollbarTargetUid = list.uid`.
  - `399:5.uikitScrollbarOffsetX = 25`.
- `client/widgets/gl/widgetsGl/renderWidgetTree.ts`
  - Adds the offset only while drawing a host-owned UIKit scrollbar.
- `client/game/widgets/input/questListScrollbarInput.ts`
  - Uses the same display-scaled offset for hit-testing.
  - Consumes the newly clicked shifted rail before generic widget/world click selection. This is important: without it, the generic picker still sees the cache host at its old x-coordinate, causing a phantom drag source or a click-through to the game world.
- `client/widgets/WidgetNode.ts`
  - Defines `uikitScrollbarOffsetX?: number`.

Expected test after restart:

- Only one rail/thumb should be visible.
- Wheel scroll should move the thumb smoothly.
- Click-and-hold/drag over the visible thumb/track should work.
- Clicking the rail must not walk the player or select an underlying UI element.

Do not switch this back to a list-owned native rail unless there is a measured reason; that was the regression source.

### Equipment stat import

Reported issue: after `yarn --cwd server sync-equipment-data`, cache-appended equipment such as Noxious halberd still had no stats. Torva appeared unaffected in game.

Root cause found:

`server/scripts/sync-missing-cache-items.ts` appends compact top-level JSON objects. `server/scripts/import-osrs-equipment-reference.ts` originally matched only objects with two-space indentation, so newly imported cache items were silently skipped.

Fixes:

- `server/scripts/import-osrs-equipment-reference.ts`
  - Recognizes both curated and compact appended JSON item objects.
  - Preserves the local object indentation when inserting/updating `bonuses` and `doubleHanded` fields.
  - Prefers `references/osrs-equipment.json` when available, using network only when that local source is absent.
- `server/scripts/audit-equipment-data.ts`
  - Uses the same local-reference preference.
  - Fails for actual equippable configured weapons with missing stat records.
  - Warns, rather than fails, for stale weapon configuration aliases whose cache item is not equippable.
- `server/data/items.json`
  - Was refreshed against the current local cache/reference. This is intentionally a large change (about 1,574 populated bonus records).

Validated current data:

```text
Noxious halberd (29796): [80,132,0,0,0,0,0,0,0,0,142,0,0,0]
Torva full helm (26382): [0,0,0,-5,-5,59,60,62,-2,57,8,0,0,1]
Noted Torva full helm (26409): noteId -> 26382
```

The dry-run importer is now idempotent:

```text
[equipment-import] Dry run: matched 5590 cache items; 0 bonus records and 0 two-handed flags would be updated.
```

The audit currently reports:

```text
cache items=33121; equipable=6701; missing 14-value bonuses=1450; reference-backed gaps=0
```

The 1,450 remaining gaps are cache-marked equipables without an entry in the public reference; no reference-backed gaps remain. Stale configuration warnings currently name IDs `84, 1277, 1289, 1411, 21202, 31586`; these are configuration cleanup, not a failed import.

Developer-only hidden command added:

```text
::itemdata 29796
::itemdata 26382
::itemdata 26409
```

It reports what the **running server** loaded, including raw item slot, resolved linked definition, slash, and strength. It is intentionally hidden from `::commands`.

### NPC drops

Reported issue: most NPCs had no drop-table viewer data; General Graardor only dropped big bones, later showed no drops at all; Commander Zilyana had no drops.

Important fact: the client cache has NPC definitions, but not authoritative server-side drop tables. The full OSRSBox/Wiki-derived source is:

```text
references/monsters-complete.json
```

This file is ignored because it is large, reproducible reference content. It must be present at runtime.

Root cause: the loader swallowed missing/read failures and returned an empty array, while startup ran the downloader with `--if-missing` and could continue after a failure. The world appeared healthy but had no imported drop tables.

Fixes:

- `server/scripts/sync-osrs-npc-drops.ts`
  - A failed required source bootstrap now exits non-zero rather than silently continuing.
- `server/src/game/drops/monstersCompleteSource.ts`
  - Logs either successful source/table count or the exact path/error.
  - Exposes runtime status.
- `server/src/game/drops/NpcDropRegistry.ts`
  - Exact imported NPC IDs are authoritative for current live GWD IDs (`2205`, `2215`).
  - Small manual bone tables remain only as a safety net if source data is unavailable.
- `server/src/game/drops/manualTables.ts`
  - Adds those two minimal safety-net tables.
- `server/gamemodes/vanilla/widgets/npcDropTableWidgets.ts`
  - Adds `::dropsdebug <npcId>` to prove the actual live lookup source/count.

Validated local source content:

```text
Commander Zilyana (2205): 27 source drops
General Graardor (2215): 28 source drops
```

Expected live diagnostics after restart:

```text
::dropsdebug 2205
::dropsdebug 2215
```

They should report `source=imported-id`, nonzero entries, and a nonzero source table count. If they report an error or `source=manual`, inspect the server startup log for the `[drops]` source path/error first; do not guess at NPC IDs or viewer UI.

The player-facing command remains:

```text
::drops <npcId>
```

Always drops are now merged into the main drops page, as requested.

### Fire cape / Infernal cape icons

Known cache models supplied by the user:

```text
Fire cape 6570: inventory 9631, male 9638, female 9640
Infernal cape 21295: inventory 33144, male 33103, female 33111
```

The earlier issue was an incorrect UI item-icon fallback. During early startup, `TextureCache.getItemIconById()` could fail to get the proper 3D item model and then resolve a similarly named cache collection sprite. That fallback could select an unrelated frame and cache it for the entire session—the observed wrong Fire/Infernal artwork.

Current fix in `client/widgets/gl/texture-cache.ts`:

- Remove cache-sprite fallback for item icons.
- Wait for the injected 3D item-icon renderer instead of drawing a wrong sprite.
- Bump `ITEM_ICON_CACHE_VERSION` to `4`, so hot reload cannot reuse the earlier bad texture.

This change should fix the incorrect icon identity. Do **not** claim cape animation fixed yet.

Why animation remains a separate task:

- The 3D world renderer supports animated texture materials.
- `ItemIconRenderer` produces a cached 36×32 software-rendered inventory image, currently at one texture frame/phase.
- If the user means animated cape artwork inside an inventory/equipment widget, that renderer needs a deliberately implemented dynamic texture-frame/UV path—not a guessed `spriteId` swap.

First verify that the correct cape artwork appears after restart. If it does and the user still expects it to animate in a UI item slot, next work should trace cache texture materials for models `9631` / `33144`, then add dynamic item-icon rendering only for genuinely animated materials.

## Earlier relevant context

### UIKit

The `::dev` developer menu exists and opens for developer privileges. It includes UIKit component previews, text rows, icon rows, menu buttons, and asset/component inspection tooling. Many previous issues were resolved: search input works, filtering compacts rows, modal close no longer clicks through, native cache-backed scrollbar visuals are available, and transparency improved.

The user strongly prefers actual cache UI assets over invented approximations. A Components tab was added because many cache type-5 sprites can be inspected, but some assets/types have historically failed to render in that viewer. Do not replace settled UIKit visuals broadly while handling isolated bugs.

Known cache UI assets identified by the user:

```text
116.82  sprite 2932  settings.display-icon
116.137 sprite 4894  settings.volume-knob
116.14  sprite 2852  settings.volume.barL
116.135 sprite 2857  settings.volume.barR
```

The working native-looking scrollbar asset approach should be reused where appropriate.

### Quests and achievement diaries

- Achievement diary data was imported from the Wiki, descriptions only for now.
- Quest catalog contains all quest entries and has a standard path for real quest journals/states.
- The Ribbiting Tale / Lillypad work was intended as the permanent example, not temporary code.
- Quest list groups are Free-to-play, Members, and Miniquests.
- Quest overview uses difficulty, length, storyline, requirements in a right-side layout.
- Quest text wrapping and achievement wheel scrolling were previously improved.

Important future quest-state architecture:

- Dialogue steps can set state through the dialogue editor.
- Object searches/digs/etc. should use general quest-stage hooks registered against object/location/item interactions, rather than a new one-off journal file per quest.
- Quest catalog owns metadata and journal start/structure; reusable quest runtime/state mechanisms own progression.

### Other prior fixes/features

- Player/NPC chatheads were corrected. Final user-confirmed camera yaw values were NPC `-96`, player `96`; chathead zoom was backed out slightly from an earlier over-zoom.
- Player running/pathing now moves two tiles per tick when run is enabled, without treating the intermediate tile as occupied. “Crawling” was only an internal interpolation term, not a game mechanic.
- NPC under-player presentation was addressed with auto-movement logic; user liked that solution.
- Equipped items enforce requirements when their item data supports it.
- `::commands` was cleaned to hide implementation-heavy dialogue commands.
- `::resetstats` exists for testing.

## Cache/data setup

The user’s current cache output was:

```text
cache=osrs-237_2026-03-25
```

Useful commands normally run by the user:

```text
yarn --cwd server sync-equipment-data
yarn --cwd server sync-npc-drops
```

For the current changes, a server/client restart is sufficient. There is no need to rerun equipment sync immediately because `server/data/items.json` was already refreshed. If a future cache sync appends new records, the fixed `sync-equipment-data` pipeline should import their reference stats correctly.

## Validation already performed

Using the bundled Node runtime because the workspace shell does not expose normal `node`/`yarn` binaries or installed project dependencies:

- `import-osrs-equipment-reference.ts --dry-run` passed with zero proposed updates.
- `audit-equipment-data.ts` passed with zero reference-backed gaps.
- `items.json` parses as valid JSON.
- Direct source-data validation confirmed the GWD records and drop counts above.
- Syntax checks passed for the recently edited client/server TypeScript files via Node strip-types mode.
- `git diff --check` has no content whitespace errors; it only prints line-ending conversion warnings.

## Current modified files

At the time of this handoff, these files are modified and should be treated as intentional in-scope work:

```text
client/game/widgets/input/questListScrollbarInput.ts
client/widgets/WidgetNode.ts
client/widgets/custom/questList.ts
client/widgets/gl/texture-cache.ts
client/widgets/gl/widgetsGl/renderWidgetTree.ts
server/data/items.json
server/gamemodes/vanilla/widgets/npcDropTableWidgets.ts
server/scripts/audit-equipment-data.ts
server/scripts/import-osrs-equipment-reference.ts
server/scripts/sync-osrs-npc-drops.ts
server/src/game/drops/NpcDropRegistry.ts
server/src/game/drops/manualTables.ts
server/src/game/drops/monstersCompleteSource.ts
server/src/network/commands/ChatCommands.ts
server/src/network/handlers/chatHandler.ts
```

## First testing checklist for the next task

Restart server and client once, then report the literal output / behavior of:

1. Quest panel: wheel scroll, thumb click/hold, and click-through check.
2. `::itemdata 29796` — expect 14 stats, slash 132, strength 142.
3. `::itemdata 26382` and `::itemdata 26409` — noted version should resolve to normal Torva.
4. `::dropsdebug 2215` and `::dropsdebug 2205` — expect `imported-id` and nonzero entry/table counts.
5. Examine/open drops for Graardor and Zilyana, then kill several to verify actual table rolls.
6. Equip Fire cape and Infernal cape; confirm whether the artwork is correct. Specify whether “movement” means the worn world model or the equipment/inventory slot icon if animation still needs work.

## Recommended next work order

1. Gather the checklist results without changing unrelated UIKit code.
2. If drops fail, use `::dropsdebug` and the `[drops]` startup log before changing lookup code.
3. If Noxious/Torva still lack stats, use `::itemdata` first to establish whether the running server was restarted / uses current `items.json`.
4. If the cape icon is correct but needs animation, inspect models/materials and implement a targeted dynamic item-icon path.
5. Only after these are green, proceed to the planned large overhaul / new UI features.
