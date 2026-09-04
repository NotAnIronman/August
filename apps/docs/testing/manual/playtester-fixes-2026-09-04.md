# Keybindings, item disposal, pets, and layout assessment

- Owner: client widget input; server inventory, followers, and character persistence.
- Date/tester: 2026-09-04, Codex automated checks and local cache inspection.
- Cache: OSRS revision 237, `osrs-237_2026-03-25`.
- Build: production client `main.94af944b.js`; optimized build and artifact check passed.
- Status: 42 standard client test files and 183 standard server test files passed;
  application/test typechecks and repository checks passed. Public gameplay revalidation pending.
- Validation meaning: tests exercise input dispatch, packet/save round trips, menus,
  item disposal, and pet routing. They do not establish live external gameplay success.
- Exit condition: deploy the updated server and production client, then complete the
  playtester checklist below on desktop and phone.

## Implemented behavior

F1-F12 now execute cache-installed widget op bindings through the normal widget action
route. Debug F1/F4 shortcuts no longer compete with them. Held F keys do not repeatedly
toggle a tab. Settings varps 1224, 1225, and 1226 transmit to the server, persist on the
character, and replay on login, including explicitly cleared zero values. In this cache,
keybinding varbits use those three backing varps; do not assume varbit 4685 is a binding
(it belongs to varp 1776).

The local item audit found 5,584 definitions whose normal Drop action was blocked by a
legacy `dropable=false` flag. Normal Drop no longer uses that flag. Destroy/Discard require
confirmation, including when a client tries to send Drop instead. Inventory removal occurs
only after a ground spawn succeeds. The player's normal inventory adds Drop where native
actions occupy all slots, without replacing Dismantle, Revert, Uncharge, etc. Bank and trade
menus do not gain this action. The cache audit found 223 non-placeholder named definitions
without a Drop/Destroy/Discard action; these include Release and other special fifth ops.

Supported pet rewards use the explicit item-to-follower NPC mapping:

1. No existing follower: summon the new pet, even with a full inventory.
2. Existing follower: give the pet item to inventory.
3. Inventory full: put the pet item in the bank.
4. Both full: save a pending reward on the character and retry every five server ticks.

Acquisition credits the collection log once. Deferred delivery does not credit it again.
Monster reward spawns and Araxxor's Nid reward enter this shared path. Ordinary item
drop/pickup and player-death ground spawns are not new acquisitions. This does not add
new pet roll tables. The audit also added mappings for the 18 existing kitten/cat item
variants (1555-1572), retaining their colour and growth-stage appearances; cat aging and
feeding are not implemented by this change. Existing pet inventory Drop summons the
mapped NPC rather than rendering an item model on the floor. Collection-log credit uses
the existing trackable-item set; ordinary cats are not boss/skill collection-log entries.

## Layout assessment — implementation deferred

The cache and server already contain separate interface foundations:

| Server mode | Root interface | Decoded widgets |
| --- | ---: | ---: |
| Fixed | 548 | 96 |
| Resizable normal | 161 | 99 |
| Resizable list | 164 | 98 |
| Fullscreen | 165 | 43 |
| Mobile | 601 | 135 |

`widgets/viewport` contains interface mappings and desktop/mobile mounting helpers.
These are a starting point for wiring, not evidence that every mode is complete.
Desktop login currently selects resizable normal. Client SETWINDOWMODE only changes a
client value; GETDEFAULTWINDOWMODE is fixed at 2 and SETDEFAULTWINDOWMODE discards its
argument. Future work needs a mode-change protocol, server-selected root/interface
remounts, saved defaults, canvas sizing, and checks of every tab/modal in each mode.
The reported repeated "Resizable - Classic layout" label was not reproduced visually;
do not treat it as proof that the two underlying resizable roots are identical.

## Password clarification

No plaintext-password persistence was added. Existing encrypted local password storage
depends on a secure browser context; public HTTP retains username-only fallback.
The login encoder writes the password into its packet without application-layer
encryption. A `ws://` connection therefore does not encrypt it in transit. HTTPS/WSS
is the appropriate hosting follow-up; TLS/certificate deployment was not performed.

## Playtester checklist

- Assign each F key, close settings, and check the assigned tab. Rebind and clear a key.
  Hold a key to check it does not repeatedly collapse/reopen its tab.
- Log out cleanly, then use the same character on another browser/device. Verify mappings
  and cleared bindings survive. F keys require a physical keyboard on mobile.
- Drop a previously blocked untradeable. Confirm it appears and can be picked up.
  Check an item with Dismantle/Revert still offers that action as well as Drop.
- Cancel and confirm Destroy; verify the item only disappears after confirmation.
- Exercise pet reward cases with no follower, an existing follower, full inventory, and
  full inventory plus bank. Check appearance, ownership, bank contents, and log credit.
  For the last case, log out/in before freeing a slot and verify exactly one delivery.
- Recheck username-only saving over public HTTP and encrypted password saving over a
  secure origin. Do not use valuable/reused passwords on the public HTTP endpoint.

Automated coverage: `widget-keybindings.test.ts`, `inventory-disposal-menu.test.ts`,
`tab-keybinding-persistence.test.ts`, `inventory-disposal.test.ts`,
`pet-reward-delivery.test.ts`, and `player-persistence-sanitization.test.ts`.
Revalidate after changes to cache revision, widget op routing, item actions, or account
serialization. Replace pending manual results with actual observations after deployment.
