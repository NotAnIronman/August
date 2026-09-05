# Theatre of Blood setup

The base room instances, party progression, disconnect recovery and progress-loss confirmations
are implemented. Encounters, boss spawns, mechanics and final loot are deliberately not installed
yet. Ordinary exit clicks cannot complete an unfinished room.

## Entrance and rooms

Use entrance object **32653** near **3677,3219,0**. Choose solo, create a party (maximum five),
or join a waiting party. Once an encounter starts, new recruits cannot join that run; eligible
disconnected members can still return.

| Order | Room | Entrance | Exit object | Padded bounds X / Y |
| --- | --- | --- | --- | --- |
| 1 | Maiden | 3219,4460,0 | 33113 | 3151–3229 / 4418–4467 |
| 2 | Bloat | 3322,4447,0 | 33113 | 3265–3326 / 4429–4466 |
| 3 | Nylo | 3295,4283,0 | 33113 | 3276–3315 / 4229–4287 |
| 4 | Sotetseg | 3280,4293,0 | 33113 | 3263–3296 / 4289–4338 |
| 5 | Xarpus | 3170,4375,1 | 32751 | 3151–3189 / 4370–4404 |
| 6 | Verzik | 3168,4297,0 | 33113 | 3149–3187 / 4292–4332 |

These are the supplied bounds plus four tiles on every edge. Map copies additionally round
outwards to eight-tile chunks. Explicit scene origins keep Maiden's western side inside the
104-tile instance view; server collision and client rebuild packets use the same origin.
Every room copies all four cache planes. Maiden, Bloat, Nylo and Sotetseg enter on logical
plane 0 but stand on plane-1 bridge surfaces; omitting those surfaces leaves players beneath
the stairs. Xarpus remains on logical plane 1 and includes the lower pit and its height base.
Bridge collision is shifted once during scene linking, just as in the non-instanced map.
Xarpus skeleton **32741** is retained as a reference; no skeleton interaction is invented yet.
The supplied six-boss order takes precedence over the conflicting Nylo/Verzik exit labels.

Developer accounts have **Preview rooms (development)** in the entrance menu. The preview
picker has two pages of three rooms. Preview instances award no progress or rewards; the room
exit returns outside. Normal accounts do not receive this menu.

## Checkpoints and parties

- Each player stores a versioned checkpoint; a shared SQLite `theatre_runs` record holds the
  party's authoritative room, roster and completed-room count. It does not rely on player IDs.
- A normal disconnect removes the player from the private instance and saves them outside.
  Clicking the main entrance offers continuation. Reconnecting party members enter the room
  their original party currently occupies, at that room's entrance.
- If nobody remains, the next eligible return reconstructs one shared instance at the first
  unfinished room. The unfinished fight resets; completed rooms are not replayed.
- Server interruptions can recover the latest saved player state and durable party checkpoint.
  Saved private-room locations resolve outside, not into an uninstanced copy of the arena.
- Trading, taking ground items, opening a bank, teleporting, voluntarily leaving and logging
  out require confirmation to discard protected progress. Cancel keeps it. In-raid pickups
  remain allowed; the pickup restriction applies after disconnecting.
- Confirmation durably saves the cleared checkpoint before retrying an action. Save failures,
  reused confirmations, changed sessions, changed locations and superseded prompts cannot
  authorize the action. A protected trade recipient must initiate and confirm first.
- Medallion teleports retry the complete ownership-checked action. The generic queued teleport
  fallback asks for a fresh teleport click after confirmation, so it cannot skip rune/charge
  validation belonging to the original spell or item handler.
- Death invalidates the checkpoint. Voluntary logout/exit is not a disconnect continuation.
  A cleared checkpoint cannot rejoin its former run through the ordinary party-join menu.

Future encounters should obtain `theatreRuns(services)` from the module, call
`startRoom(instanceId, roomId)` when the encounter begins, and call
`completeRoom(instanceId, roomId)` only on authoritative completion. Completion is ordered and
idempotent. An unlocked exit transfers connected members together to the next room. Only after
all six rooms are complete can the final exit finish the run. The final reward implementation
still needs its own durable claim transaction; this batch grants no loot.

## Drakan's medallion (22400)

Inventory and worn-item options use these user-specified destinations:

| Option | X | Y | Plane |
| --- | --- | --- | --- |
| Ver Sinhaza | 3649 | 3230 | 0 |
| Slepe | 3808 | 9754 | 1 |
| Darkmeyer | 3605 | 3362 | 0 |

The current cache already defines these options. The handlers use the shared teleport action
queue, respect `canTeleport` and pending teleports, and recheck item ownership when executed.
They do not consume the medallion or intercept Wear/Drop. Charges, quest unlocks and custom
teleport animations are not added in this initial setup.

The native inventory operations are sparse: Wear=2, Ver Sinhaza=3, Darkmeyer=4, Slepe=6,
Drop=7, Examine=10. Worn operations are Remove=1, Ver Sinhaza=2, Darkmeyer=3, Slepe=4.
Both equipment interfaces now distinguish teleports from Remove using server-side cache data.

## Development IDs

Open the xRSPS/plugin settings panel, scroll to **Development**, and enable
**Show object, NPC and item IDs**. Reopen the object's right-click menu and read the ID beside
Examine. This uses the existing debug-ID renderer and also reveals unnamed entities where
supported by that renderer. The toggle is saved locally per browser, with safe fallback when
browser storage is unavailable. It replaces the old Client graphics debug checkbox.

## Host smoke test

Sync all changed **and new** files, **rebuild the client**, restart the game server, then
hard-refresh each browser. The equipment/instance-rendering follow-up changes both server
and client runtime code; a server restart alone will not deploy the rendering fix. No cache
rebuild or account-storage clearing is needed. The Theatre table is created automatically in
the existing database.

1. Enable IDs, right-click several objects and note their Examine IDs. Reload and confirm the
   preference remains enabled. Disable it and verify the ordinary menu labels return.
2. Use each medallion option from inventory and equipment; verify the coordinates and plane,
   especially Slepe's underground destination on plane 1.
3. Confirm stale clicks after moving/removing the medallion do not teleport, and that existing
   teleport restrictions are still enforced. Normal Wear, Remove and Drop should remain intact.
   Remove armour, weapons and jewellery from both equipment interfaces. Native worn buttons
   send an absent-item sentinel; this must not be mistaken for a mismatched equipped item.
4. Enter solo and create/join a two-player party. Verify isolation between runs and a shared
   room within the party. Unfinished exits must not skip the encounter.
5. Disconnect a party member, reconnect, and use Continue at the entrance. They should enter
   the same instance as the remaining member. Repeat with everyone disconnected.
6. After disconnecting, test Cancel and Confirm for bank, trade, pickup and medallion teleport.
   Cancel preserves Continue; Confirm performs the action and removes Continue. Also test
   voluntary logout and leaving. Existing inventory and equipment must remain unchanged by resume.
7. On a developer account, preview all six rooms and inspect terrain, collision, walls and
   decorations. Confirm the 3D terrain and players appear immediately, including when crossing
   map-square boundaries. Check the first four entrances place you on the stairs, not underneath,
   and that you can walk into the rooms. Xarpus alone uses logical plane 1; its lower pit should
   also render. Use Development IDs to gather encounter objects.
8. On HTTP, the storage/cache warning should show once per browser tab session. Dismiss it,
   reload, and confirm it stays hidden. A new session can show it again. If the browser blocks
   session storage completely, suppression is limited to the current page lifetime.

Automated coverage includes every padded tile, the real instance lifecycle, party room transfer,
disconnect/reconnect with new player IDs, full-party reconstruction, ordered completion, durable
SQLite records, confirmation replay/failure handling, guarded service entry points, real
socket-close ordering, native cache menu slots, wire-encoded equipment operations and all six
rooms' render bounds, player selection, camera heights and bridge flags. Live terrain,
collision and visual transitions still need the host smoke test; boss combat awaits encounter work.
