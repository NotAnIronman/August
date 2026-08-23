# Handoff — August (OSRS server) UIKit & Cache Naming Work

**Repo:** `NotAnIronman/August` — TypeScript OSRS private-server reimplementation (client + server).
**Workflow established this session:** I read/edit a local clone, generate a `git diff`-format `.patch` file, verify it applies cleanly against a *fresh* clone with all prior patches in sequence (plus run `client/tests/uikit-panel-builder.test.ts`), then hand you the patch. You apply with `git apply <file>.patch` from repo root, restart the client, hard-refresh the browser, test, and report back. You push to GitHub yourself after testing locally — I verify against your actual pushed repo when I can, since it's the ground truth.

---

## What this session was actually about

Building a full workflow for identifying and naming the ~7,500 raw sprites in the game's cache, so UI code can reference them by name (`"skill.attack"`) instead of magic `archiveId:frame` numbers — plus fixing several unrelated pre-existing UIKit bugs found along the way (menu buttons, level-up icons, native quest text/scrolling).

---

## Core systems built (all live and working)

### 1. Sprite naming registry
- **`client/public/spriteNames.json`** — flat map `"archiveId:frame" → "common.name"`. Lives under `public/` deliberately: served unbundled straight off disk by the dev server, so the client can poll it over HTTP and see changes within one poll interval — no rebuild, no restart.
- **`server/src/world/SpriteNameCatalogFile.ts`** — server-side read/write/validate for that file. `setSpriteName()`, `readSpriteNameCatalog()`, `resolveSpriteRefByName()` (reverse lookup, used by native-interface scripts like the level-up popup).
- **`client/widgets/uikit/SpriteNameCache.ts`** — client-side poller (currently **600ms**, was 1500ms). Also holds **optimistic local overrides**: `applyLocalSpriteName()` applies a name instantly client-side and tracks it as "pending" until a poll's own fetched data confirms it — this exists specifically to prevent rubber-banding (an in-flight poll that started *before* your click resolving *after* it, briefly reverting your change).
- **`client/common/uikit/spriteNames.ts`** — shared, environment-agnostic helpers (`spriteRefKey`, `parseSpriteRef`, `isValidSpriteCommonName`) importable from both client and server without pulling in browser/Node-specific code.
- **`::Rename <archiveId:frame> <name>`** chat command (`server/gamemodes/vanilla/widgets/devUIKitMenu.ts`) — the actual naming mechanism. Name pattern: letters/digits/`.`/`-`/`_` only, max 80 chars, validated server-side (client never silently pre-validates and swallows — that was a real bug, see Gotchas).
- **`"skip"` is a reserved name** meaning "reviewed, not useful, don't ask again." Filterable separately from unnamed/named.

### 2. Using named sprites in real UI
- **`widget.cacheUiAsset = "skill.attack"`** just works — no separate registration step. `client/widgets/uikit/CacheUiAssets.ts`'s `resolveAssetDefinition()` checks, in order: the hand-curated `CACHE_UI_ASSETS`/`CACHE_UI_ASSET_ALIASES` dictionaries → raw `cache.widget.*`/`cache.sprite.*` patterns → **named common-name lookup** (`resolveSpriteByCommonName`, new this session). The curated dictionary still exists for cases needing extra metadata (e.g. pulling a sprite off a specific existing widget component); for the common case, `::Rename` *is* the whole workflow now.
- **Hover-swap support**: `cacheUiAssetHover` (parallel field) resolves a second asset shown on real mouse-hover, for *all three* asset kinds (named-sprite, archive-sprite, widget-sprite) — required tracing three separate render code paths and adding `spriteId2`/`cacheSpriteTokenHover`/`cacheSpriteArchiveIdHover` fields plus extending the hover-eligibility gate (`shouldCheckWidgetHoverVisual` in `interactionMenuCache.ts`) to cover sprite widgets, which it didn't before.
- **`set_sprite` wire-protocol action** (new, mirrors the existing `set_item`) — lets server scripts push a named cache sprite onto a **native** (non-UIKit) widget, e.g. the level-up popup icon. Supports optional `x/y/width/height` overrides, because native widget rects are often not shaped for a replacement sprite (had to also force `widthMode`/`heightMode`/`xPositionMode`/`yPositionMode` to `0`/absolute — the cache's own layout mode otherwise silently keeps overriding raw pixel values).

### 3. The sprite gallery (`::dev` → Components → Browse all cache sprites)
This got the most iteration. Current state:
- **8×6 = 48 cells/page**, flat-indexed pagination (fixed a real bug where the old per-archive pagination silently dropped frames that overflowed a page boundary).
- **Search box** — filters by name or raw ref, purely client-side.
- **Filter toggle** — cycles All → Unnamed → Named → Skipped, server-tracked per player, now shows a **live count** e.g. "Filter: Unnamed (3,214)" computed client-side (server has no access to cache data to compute this itself).
- **Click an icon** → repurposes the search box into a name field (pre-filled if already named), Enter submits via the same `::Rename` chat pipeline (`sendChat()` — a real existing client function, no new protocol needed).
- **Right-click an icon** → instant skip, no menu, no typing.
- **Instant client-side feedback** — both actions apply locally immediately (see `applyLocalSpriteName` above); the server catches up within ~600ms.
- **Right-click's native context menu is suppressed** over gallery cells specifically (not globally — touching the global menu system was deliberately avoided given its size/blast-radius).
- **Dedicated invisible "hit zone" widget per cell** (`SPRITE_GALLERY_HITZONE_BASE`) — the visible icon widget shrinks to the sprite's own aspect-fit pixel size and left real dead space around small/narrow icons that wouldn't register clicks; a full-cell hit zone, decoupled from precise rendering, fixed both the click-precision issue and the right-click-menu suppression at once.
- Panel is clamped to **512×334** centrally (see Gotchas — hard container ceiling).

---

## Hard-won gotchas (read before touching input/click/keyboard code again)

1. **Enter is OSRS keycode 84, not 13.** `client/game/InputManager.ts`'s `OSRS_KEY_MAP` remaps DOM keycodes to the engine's own internal codes: DOM Enter (13) → OSRS 84. OSRS code **13** is actually DOM Escape (27) remapped. This caused a real, fully-silent bug (Enter did *nothing*, not even an error) that took several rounds to find. Any future keyboard-handling code must use these OSRS-native codes, never raw ASCII/DOM codes.
2. **`clickMode2` vs `clickMode3`.** `clickMode2` is a *held* state — true for the entire physical duration a mouse button is down, often several frames. `clickMode3` is a genuine single-frame edge-triggered pulse. Anything doing one-shot "did a click just happen" detection must use `clickMode3` with manual edge-detection (track `lastClickMode3`, compare each frame) — using `clickMode2` caused a real focus-stealing race when a click on one widget programmatically focused a *different* widget (the search box): the box's own `clickMode2`-based logic would see the mouse still over the original widget on the very next frame and immediately un-focus itself, often before the user even released the click.
3. **Native widgets carry their own `widthMode`/`heightMode`/`xPositionMode`/`yPositionMode`** (real cache-format fields, `0` = absolute, other values = percentage/stretch modes). Setting `rawWidth`/`rawHeight`/`rawX`/`rawY` alone does nothing if the widget's mode isn't also reset to `0` — the layout system keeps recalculating from the old mode every frame, silently overwriting your values.
4. **Widgets only get registered as native click targets** (and thus appear in `clicks.getHoverTarget()` / the native right-click context menu system) **if they have real cache `actions`/CS2 click/inventory-item/button flags.** Plain UIKit-built sprite/text widgets without these never appear in that system at all — relying on it for hit-testing UIKit widgets silently does nothing. Use direct geometric hit-testing (`_absX`/`_absY`/`_absWidth`/`_absHeight`, populated during the render layout pass) instead.
5. **The `mainmodal` container (every `openModal`-mounted panel) is capped at 512×334 pixels.** This is a real, hard ceiling from the native client, not a UIKit design choice — took three wrong size guesses (720×570, then 640×440 assumed-safe-by-precedent, both wrong) before adding a real diagnostic (`console.log` in `WidgetManager.ts`'s `openSubInterface`) and then centrally clamping every panel in `buildUiPanel()` so this can never regress panel-by-panel again.
6. **`sendChat(text)`** (`client/network/serverConnection/outgoing/inventoryChat.ts`) lets client code trigger any existing chat command programmatically, sanitized via `sanitizeChatText` (preserves `:` `.` `-` `_` etc., so command syntax survives intact). This is how click-to-rename works with zero new protocol — reuse this pattern before inventing new client→server plumbing for anything that could just be "type this chat command for the user."
7. **My own sandbox had repeated integrity drift** — a stale local working copy silently missing earlier features. I now always diff against a known-good checkpoint before packaging a patch, and do a full clean-room verification (fresh clone → apply every prior patch in sequence → run tests) before delivering anything. Worth knowing in case a future patch ever looks like it's reverting something that should already be there — ask, don't assume it's intentional.

---

## Outstanding items (from the original 8-issue list, not yet done)

3. **Quest text wrapping inconsistency** — root cause found: `wrapTextToLines` (`client/widgets/uikit/textMarkup.ts`) wraps by flat character count, not real pixel width, which is inherently inconsistent for a proportional font. A pixel-accurate version already exists elsewhere (`measureMenuText` in `client/widgets/gl/choose-option.ts`) and could be ported in. **Not done** because `wrapTextToLines` is shared by the quest journal *and* the skill guide (and maybe more) — wanted to audit every caller before changing its contract, not guess.
4. **Branching dialogue system** — deliberately not started. This is a real feature-design conversation (structure, response options, how `::Setdialogue` should evolve), not a bug fix — needs to happen before any code gets written.
5. **Achievement diary scroll wheel doesn't work** — investigated the wheel-handling code path fully, it reads as structurally correct, no confirmed root cause yet. Needs to know: does this happen on *every* UIKit panel, or just the diary specifically?
6. **`::AddTask` command for testing the achievement diary** — found a real architecture conflict before writing anything: diary tasks are fixed-size arrays sized to match real completion totals tracked elsewhere; a command that freely appends tasks would desync those totals. Proposed a decoupled, dev-only test-task mechanism instead — **awaiting your OK on that design** before building.
7. **Split scrollbar on the native quest journal** — confirmed this is a genuinely different code path (the *native*, cache-driven quest list interface, not anything UIKit-built). Not investigated yet at all.

**Also discussed but not built for the gallery:**
- Jump-to-range tabs (0, 1000, 2000…) — not started.
- Minimum-size filter to hide tiny structural sprites — you explicitly declined this (worried about missing real icons at odd sizes); pure manual skip-flagging was built instead, and that's working well per your last message.

---

## Quick orientation for a fresh chat

If you're picking this up in a new conversation, the fastest way to get me back up to speed: link this file, or just say what you want next from the outstanding list above. The GitHub repo itself is the actual source of truth — I'll clone and verify against it directly rather than assume state from a summary alone.
