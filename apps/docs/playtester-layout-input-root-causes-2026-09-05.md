# Layout and alternating-click fixes — 2026-09-05

This supersedes the layout/input diagnosis and browser-shortcut expectations in
[the preceding follow-up](playtester-layout-combat-followup-2026-09-05.md).
The working combat/status changes are unchanged.

## Confirmed causes

- **Missing tabs/chat after layout changes:** login sent permanent `open_sub` packets directly,
  bypassing `PlayerWidgetManager`. Layout switching preserved interfaces from that registry,
  which did not know those tabs/chat were open. The client installed the new root without its
  subinterfaces. Character-design completion had the same bypass. Both now share
  `mountLoginGameframe`, which registers mounts and dispatches their packets together, preserving
  journal initialization, orb timers, XP visibility and tutorial filtering. A fresh login root
  silently clears obsolete registry entries first, including reconnects.
- **Every other left-click:** mouse input is received by the canvas wrapper. Closing a world menu
  focuses the canvas; the next left press focuses the wrapper again. Its bubbled `focusout`
  handler treated this internal transition as leaving the game and erased pointer coordinates.
  World picking then used the erased hover position instead of the saved press position, often
  resolving to Cancel. Internal focus transfers now preserve input, and world picking uses the
  saved coordinates for both left and right presses. Actual focus loss still clears held state.
- **Brave Shift-right-click:** Brave reserves this gesture to force its native context menu.
  See [Brave's implementation issue](https://github.com/brave/brave-browser/issues/54790).
  It cannot reliably be cancelled by website event handlers. **Ctrl-right-click** now opens
  Menu Entry Swapper configuration for world targets, inventory items and spells. Shift-right-click
  remains supported where the browser permits it. Ctrl editing does not activate saved Shift-click
  preferences or change normal Shift-click actions. Sidebar instructions describe the new shortcut.

## Regression coverage

- The real-cache layout transaction test explicitly reproduces the old direct-packet login:
  populated UI becomes an empty root after switching. The corrected production login mount path
  then survives six layout switches, including root resize/transmit callbacks, visible chat and
  all 14 native tab operations. Earlier tests manually populated the registry, masking this bug.
- Settings coverage starts from each desktop layout, with tutorial restrictions and both minimap
  modes, and checks character-design completion followed by another layout switch.
- The new world-click test failed on **click 2** with the old input code. The fix passes repeated
  yellow/red actions, adjacent-frame presses, internal focus transitions and pointer exit before
  rendering. Input tests also cover Ctrl snapshots without a preceding keydown and focus cleanup.
- Full client suite: 54 test files passed. Focused server suite: 5 files passed (settings,
  real-cache layout transaction, login reservation, trade inventory and viewport mappings).
- Workspace-wide typechecks, repository checks, the production client build and build-artifact
  checks passed (922,100 gzip bytes, below the 1,048,576-byte limit). These are automated code/cache
  tests, not a rendered gameplay test on the user's Brave installation.

## Host update and smoke test

Sync **all changed and new source files**, including `apps/server/src/widgets/loginGameframe.ts`.
From the repository root:

```powershell
pnpm --filter @august/client build
```

Restart the game server with the normal command and hard-refresh clients once. The server runs
TypeScript directly; no separate emitted server build is needed. Do not clear player saves,
browser account storage or rebuild the game cache.

1. Log in, cycle Fixed Classic → Resizable Classic → Resizable Modern → back several times.
   After each change, click every tab and type in chat without reloading. Repeat with the plugin
   sidebar open; also confirm a relog into the preferred layout remains functional.
2. Click the same ground tile at least ten times, then alternate ground and attack/object clicks.
   Every valid press must show its yellow/red feedback. Repeat after opening/closing a game menu,
   switching layouts, moving the pointer quickly, and returning focus from the sidebar.
3. In Brave, use **Ctrl-right-click**, not Shift-right-click, to configure NPC, inventory and spell
   swaps. Verify both left-click and Shift-click preferences afterward. Ordinary right-click should
   still show the game menu. Brave may still show its native menu for its reserved Shift gesture.
4. Check inventory dragging, tab F-keys, chat, middle-drag camera, and mobile taps/long-press menus.
   Clicking an actual UI control must not also send a world click.
