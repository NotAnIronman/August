# Boss and loot fixes — 2026-09-06

## Changes

- Ground-item geometry now resolves the actual instance mesh, including tiles outside its 64-tile resource key. Labels and terrain-height queries use the same footprint lookup. Overlay map IDs are no longer truncated during ground mesh updates.
- Grotesque Guardians Escape returns to 3427,3541,2, including the public source-roof exit. Each party member's HUD follows their own living boss combat target, falling back to the encounter's living boss when untargeted.
- Boss HUD preferences are Classic (default), Modern, None. None is saved locally.
- Collection-log and loot notifications have a non-accumulating 100-pixel downward layout offset that survives native script repositioning.
- Ground-item edit buttons hit-test the saved press coordinates, converted to framebuffer pixels. Repeated hide/highlight clicks remove their exact list entry; the underlying value tiers and advanced rules still apply.
- Amethyst replacement updates preserve an unspecified rotation over the wire, instead of converting it to west. All four explicit rotations still round-trip. The same protocol is used for respawn and replay.
- Reward controls use inventory 1226:0, bank 1227:0, destroy 1235:0 with border 761:0. Resize grip is 4552:0, rotated clockwise 90 degrees. Reward slots in the current panel have no backplates and retain their native 36×32 size.
- Destroy asks for confirmation. Barrows, Lunar and Theatre rewards use durable partial-claim state for destruction as well as deposits. Failed persistence restores remaining loot; destroyed items are not added to the collection log.
- Moving off a context menu now uses the same complete cleanup as selecting an option, including the current widget interaction controller rather than obsolete client fields.
- Collection-log snapshots retain all 2048 slots. Previously the backpack normalizer clamped every entry beyond 28 to slot 27, producing missing item counts despite green category completion.

## Griffin mechanics reference

The user-supplied disease/armour indicator is cache sprite **1361:0**. Its presence was checked in the cache; this patch does not implement the encounter mechanics.

## Deployment and testing

Restart both server and client together: object-rotation encoding now uses 255 for "unchanged". The development client at localhost:3000 serves `static/js/bundle.js`; restarting only the game server does not restart that development process. Production hosts should rebuild the client and restart the server, then reload the browser completely.

Test Shellbane drops; both Guardians targets and Escape; all HUD styles; collection/loot notifications; Alt +/- twice at normal and scaled resolution; all amethyst wall orientations through depletion and respawn; each reward deposit/destroy control; and repeated right-click/hover dismissal. Verify Scurrius counts on an account with more than 28 logged items.

## Private-message investigation

Native cache prompt/typing/Enter tests, outgoing binary packets and server targeted-delivery tests pass. The reported live failure is not yet reproduced. The tester's console did not expose `window.__osrsClient`, which this source installs during client initialization. A read-only bundle check was requested to distinguish console-context or running-source differences before applying another speculative PM change.

The copy/paste diagnostic is in [private-message-check.txt](private-message-check.txt). It reports bundle markers and input-state metadata without exposing message text, recipients or login details.

## Verification

Twenty focused client/server test files passed after updating outdated headless input fixtures. Both applications and their tests typecheck. Package boundaries, documentation links and the client artifact budget pass. Production output: `main.b04a534b.js` (925,986 bytes gzip). Host/browser gameplay verification remains necessary, particularly the still-unresolved private-message report.
