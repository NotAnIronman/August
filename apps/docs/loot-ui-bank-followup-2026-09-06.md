# Loot UI and playtester follow-up — 2026-09-06

## Changes

- Ground items: holding Alt draws `[-]` and `[+]` beside rendered item labels. These add exact item names to Hidden or Highlighted, respectively, using the existing persisted plugin configuration and removing an exact conflicting entry. Clicking a control consumes the left click; it does not walk or take the item. Modal/UI hit surfaces retain priority. Releasing Alt clears the hit regions. Existing ownership filters and label limits still apply.
- Amethyst: each successful crystal now rolls a 20% depletion chance, rather than always depleting. Existing repeat gathering, depleted variants and respawn timers are retained. Like tree depletion, a first-yield depletion remains possible; five crystals is an average, not a guaranteed yield. Other ore rocks are unchanged.
- Private messages: submit the native mode-6 prompt before other widget keyboard listeners can reset/dismiss it. The recipient/body contract is verified against cache script 681. Clear the submitted body to prevent the native callback sending it twice. Private text no longer loses public-chat formatting prefixes such as `red:`.
- Bank deposits: zero-quantity placeholders reserve their slots instead of being overwritten as empty slots. Deposit-all sends updated tab-size varbits even when the destination is the implicit current tab. Existing stacks retain their tabs and relative order.
- Placeholder release: recognize real linked cache-placeholder definitions saved as ordinary item copies. Both individual release and release-all can remove these. Detection requires a placeholder template and a reciprocal base-item link; ordinary items with a placeholder reference are not disposable. No saved account files are bulk-modified.

## Shared loot window

- Independent 480×334 default size rather than filling whatever size the previous interface left behind.
- Corner resize handles, constrained to the current modal host. The controller lives in UIKit and consumes resize gestures locally.
- Responsive four-column grid with native 36×32 item sprites; growing the window grows spacing, not stretched icons.
- Native inventory-tab bag and bank deposit artwork, text labels, and cache-backed button backgrounds.
- Source artwork accepts either a cache sprite or an item icon. Theatre currently uses a blood-rune badge, Barrows uses its named cache boss badge. These can be replaced without changing the window.
- Theatre now opens this loot window. Left-click a reward to claim that item to inventory; right-click also offers bank. Buttons claim all possible remaining loot to inventory or bank. Full destinations leave the remaining loot in the chest.
- Existing Theatre durable partial-claim accounting, rollback, ownership/position/instance checks and persistence compare-and-swap are retained. UI callbacks also require the reward modal to be open and the original raid to remain active.
- Existing already-awarded reward displays remain visual-only and hide deposit controls.

### Scope of resizing

The independent-size correction applies to UIKit panels. Resize handles are enabled on the loot panel; the controller is reusable, but arbitrary legacy cache interfaces have **not** been made resizable. Their fixed layouts need individual migration/testing. Resizing remains bounded by the native modal viewport, not an unrestricted desktop floating window.

## Verification

Focused tests cover bank slot preservation and tab counts, cache-placeholder release, Theatre claims/rollback/replay, persisted partial rewards, amethyst configuration, native prompt-to-private-message packet submission, duplicate suppression, native cache button references, loot sizing/drag ownership, ground-item edit hit regions and GL-state preservation.

Client and server typechecks passed. All 12 focused regression files passed (seven client, five server). The final production client build passed, producing `main.b7e62cb3.js`; only existing bundle-size/deprecation warnings remained. `git diff --check` passed. This workspace run does not substitute for a live two-account host test or visual acceptance on mobile.

## Host checklist

Rebuild the project, restart the server, then hard-refresh the browser client.

1. Open loot after opening a differently sized interface. Resize each corner; confirm chat/minimap/world do not receive the drag.
2. With partial/full inventory space, claim one Theatre item, bank the remainder, close/reopen, and verify quantities. Repeat with a full bank. Verify no duplicate rewards or second killcount increment.
3. Send private messages in both directions, including after reopening the friend prompt. Check that each appears once.
4. Deposit a mixed inventory into an existing bank tab containing placeholders. Confirm placeholder positions, tab membership and order remain stable. Release both ordinary placeholders and previously unremovable copies.
5. Hold Alt over ground loot; use both controls and then release Alt. Confirm the item lists survive a client reload.
6. Mine both amethyst wall variants over several respawn cycles; verify repeated crystals and eventual depletion/respawn.

## Compass follow-up

Cached top-level layouts were clearing the active compass/minimap references without restoring them; loading an inactive layout could also replace those references. The image and click target remained present, but camera-yaw updates had no reference to the displayed compass.

`WidgetManager` now restores viewport, minimap and compass references when activating any cached root, and prevents inactive preloads from replacing them. Camera angle conversion and click handling are unchanged. The new real-cache `compass-layout-cache.test.ts` covers all four layouts, repeated activation, preloading, camera rotation/wraparound, and redraw suppression when the camera is stationary. The existing layout-switch regression and client typechecks also pass. Rebuild/serve the client and refresh the browser; no server logic changed for this follow-up.
