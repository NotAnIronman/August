# Theatre of Blood setup

The base room instances, party progression, disconnect recovery and progress-loss confirmations
are implemented, along with instance-scoped boss placement and arena entry. Bosses now become
attackable after entry/confirmation, with normal-mode combat profiles. They remain stationary
damage/accuracy test targets: their outgoing attacks, add waves and phase transitions
are not installed yet. Terminal prep-target kills now complete rooms; ordinary exit clicks
cannot complete an unfinished room. The post-Verzik vault and normal-mode rewards are installed.

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
Searching Xarpus skeleton **32741**, at **3171,4397,1** (two-tile footprint), gives
**Dawnbringer (22516)** if the player has a free inventory slot and is not already carrying it.
This is available in normal and development rooms; it is a supply, not a completion reward.
The supplied six-boss order takes precedence over the conflicting Nylo/Verzik exit labels.

Developer accounts have **Preview rooms (development)** in the entrance menu. The preview
picker has two pages of three rooms. Preview instances award no progress or rewards; the room
exit returns outside. Normal accounts do not receive this menu.

## Boss placement and arena entry

| Room | NPC ID | Spawn X / Y / plane | Facing |
| --- | --- | --- | --- |
| Maiden | 8360 | 3162 / 4444 / 0 | East (90 degrees clockwise from cache default) |
| Bloat | 8359 | 3299 / 4447 / 0 | Cache default |
| Nylo | 8355 (melee form) | 3294 / 4247 / 0 | Cache default |
| Sotetseg | 8388 (combat form) | 3278 / 4326 / 0 | South (180 degrees from cache default) |
| Xarpus | 8340 (combat form) | 3169 / 4386 / 1 | South (180 degrees from cache default) |
| Verzik | 14795 Talk-to; 8370 combat | 3168 / 4325 / 0 | South (180 degrees from cache default), both forms |

Each room spawns one shared boss when its first member arrives. NPC visibility and cleanup
belong to the instance, not the first entrant, so reconnects and party joins do not duplicate it.
Option 1 **Pass** on barrier **32755** force-walks across to one tile beyond the barrier, then
starts that room once. Repeated clicks cannot queue overlapping crossings. Entry does not award
completion or rewards. Uncleared normal arenas cannot be exited through the barriers; development
previews permit reverse/exit crossings for inspection.

Verzik has no 32755 barrier. Arrivals and reconnects at **3168,4297,0** force-walk six tiles north
to **3168,4303,0**, with the walking gait looping throughout the move. This does **not** start
the encounter. **Talk-to Verzik**, continue the short authored greeting, then choose
**Yes, let's begin.** to replace her conversation form with the attackable throne form.
**Not yet**, walking away, leaving the instance or a superseded dialogue cannot start it.
Concurrent party confirmations cannot create multiple combat forms.
Talk-to works from up to **three tiles from Verzik's footprint**, with line of sight.
The passive interaction router stops at that range instead of forcing adjacency.
Right-click **Quick-start** on her waiting form skips the dialogue and readiness prompt,
using the same start validation. Both options use the three-tile reach; combat forms do
not offer Quick-start. Ordinary NPCs retain their existing adjacent interaction range.

### Combat baseline

Profiles are kept in `apps/server/src/data/theatreCombatStats.ts` and flow through the normal
NPC loader, accuracy, damage and HP systems. Sources are the OSRS Wiki pages for
[Maiden](https://oldschool.runescape.wiki/w/The_Maiden_of_Sugadinti),
[Bloat](https://oldschool.runescape.wiki/w/Pestilent_Bloat),
[Nylo](https://oldschool.runescape.wiki/w/Nylocas_Vasilias),
[Sotetseg](https://oldschool.runescape.wiki/w/Sotetseg),
[Xarpus](https://oldschool.runescape.wiki/w/Xarpus) and
[Verzik](https://oldschool.runescape.wiki/w/Verzik_Vitur), cross-checked with the
[Wiki-maintained DPS dataset](https://github.com/weirdgloop/osrs-dps-calc/blob/main/cdn/json/monsters.json)
on 2026-09-05. No network access is needed at runtime.

| Boss | Base HP | Attack | Strength | Defence | Magic | Ranged |
| --- | --- | --- | --- | --- | --- | --- |
| Maiden | 3500 | 350 | 350 | 200 | 350 | 350 |
| Bloat | 2000 | 250 | 340 | 100 | 150 | 180 |
| Nylo | 2500 | 400 | 350 | 50 | 50 | 350 |
| Sotetseg | 4000 | 250 | 250 | 200 | 250 | 250 |
| Xarpus | 5000 | 1 | 1 | 250 | 220 | 100 |
| Verzik phase 1 | 2000 | 400 | 400 | 20 | 400 | 400 |

Attack/defence bonuses, baseline max hits and cadences are also installed. Bloat retains its
undead attribute; the spawned bosses are immune to poison and venom. HP follows
[normal Theatre scaling](https://oldschool.runescape.wiki/w/Theatre_of_Blood/Strategies):
75% for 1–3 players, 87.5% for four and 100% for five, rounded down. Scaling is finalized at
start using the saved roster (not online count). Rejoining an active fight does not heal it.
Developer previews use the normal minimum scale. No custom solo/duo scale is added.
All six room floors are multi-combat, including Nylo's southern map section and Xarpus's plane 1.

Outgoing attacks are deliberately suppressed only for these instance-owned test bosses until
their real mechanics are installed. Generic retaliation would be incorrect for these encounters.
Killing a prep target now completes that room. A full normal run can award loot for testing;
do not treat this as a finished or balanced encounter. Development previews never award loot.
When phase mechanics are added, completion must move to the terminal phase death only.

`arenas.ts` also records Maiden add markers at X 3175/3179/3183/3187, left Y4435 and right
Y4457, plus Nylo left 3311,4249, middle 3295,4233 and right 3280,4249. These are markers only;
the mechanics phase will select the add forms and spawn timing.

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

Arena entry already calls `startRoom(instanceId, roomId)` through the instance-scoped controller.
Future combat should extend that lifecycle, obtain `theatreRuns(services)` from the module, and call
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

For this combat-prep batch, sync all changed **and new** files, **rebuild the client**,
**restart the game server** and hard-refresh the browser. The walking-animation fix changes
client code; a server restart alone does not deploy it. No cache
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
9. Preview every room and verify one boss at each listed tile. Pass each entrance barrier from
   outside: the player should walk through and see one encounter-start message. Double-click
   and repeat with another party member; verify no duplicate boss or overlapping movement.
10. Enter Verzik and verify the walk ends at 3168,4303 without starting. Walk to Verzik and
    Talk-to and select Not yet; confirm she stays conversational. Talk again and confirm
    Yes, let's begin; verify she now has Attack and takes damage. Repeat after disconnect/rejoin.
11. Attack each boss after entry and check HP/damage. In a four-player party Maiden should
    have 3062 HP; a solo/duo/trio should have 2625. Reconnect a party member after dealing damage
    and verify it is not healed. Boss-specific attacks remain deferred; killing the target opens progression.
12. Search the skeleton in Xarpus preview, verify item 22516, then search again while carrying
    or wearing it. Verify no duplicate. Repeat with a full inventory; nothing should be lost.

Automated coverage includes every padded tile, the real instance lifecycle, party room transfer,
disconnect/reconnect with new player IDs, full-party reconstruction, ordered completion, durable
SQLite records, confirmation replay/failure handling, guarded service entry points, real
socket-close ordering, native cache menu slots, wire-encoded equipment operations and all six
rooms' render bounds, player selection, camera heights and bridge flags. Arena tests verify
actual cache boss models/actions and barrier spans/planes, zone-driven spawning, party reuse,
crossing cancellation, stale callbacks, developer isolation and Verzik's manual start. Live terrain,
collision and visual transitions still need the host smoke test; boss combat awaits encounter work.

## Reward vault

Verzik's confirmed death creates **Stairs (32995)** at **3168,4325,0**, matching her spawn. Talk-to, Quick-start and the unlocked stairs can be approached
from the walkable tile **3168,4322,0**; the throne blocks closer floor tiles. Climb to a separate,
party-shared vault at **3237,4307,0**. All four source planes are copied, with scene origin
3216,4296. Party members enter individually and keep their original roster/chest slots;
eligible reconnects restore the same vault (or reconstruct it after the last member disconnects).
Neither reconnecting nor opening a chest rerolls rewards.

| Slot | Chest tile | Own ordinary / unique | Teammate ordinary / unique |
| --- | --- | --- | --- |
| 1 | 3234,4331,0 | 32992 / 32993 | 32990 / 32991 |
| 2 | 3227,4328,0 | 32992 / 32993 | 32990 / 32991 |
| 3 | 3242,4328,0 | 32992 / 32993 | 32990 / 32991 |
| 4 | 3227,4323,0 | 32992 / 32993 | 32990 / 32991 |
| 5 | 3241,4323,0 | 32992 / 32993 | 32990 / 32991 |

Only occupied roster slots spawn chests. Shared forms provide collision; persistent owner-only
overrides select the personal model/menu. Teammate forms have no Open action on either client
or server. Server validation also checks account, run, world view, exact chest, visible model,
plane and adjacency. Claimed chests become **32994** (ordinary) or **41746** (unique) for everyone.
The native **Teleport crystal (32996)** at **3246,4315,0**, option **Use**, returns to **3677,3219,0**.
Leaving without claiming requires the existing progress-loss confirmation.

Rewards follow the [normal Monumental chest table](https://oldschool.runescape.wiki/w/Monumental_chest),
checked 2026-09-05: one team unique pre-roll at 1/9.1, the 19-weight normal unique table,
three common rolls per non-unique recipient with noted resources, plus normal elite clue and
Lil' zik rolls. No hard-mode kits/dust or entry-mode modifiers are included.
**Current prep baseline is deathless and equally weighted across the saved roster.** Death penalties,
skipped-room eligibility, MVP scoring and Combat Achievement clue modifiers are future encounter
integration, not implemented accuracy claims. Ordinary existing elite clues suppress another clue
at claim time. Rewards are rolled and saved once with final completion.

Chest claims commit the claimed flag, inventory, collection log and deferred pet delivery together
in one SQLite transaction. A failed save or insufficient inventory space rolls back the entire claim.
Nothing spills on the ground. Existing pet delivery handles auto-follow/inventory/bank on the next
tick. Theatre log completions currently count successful reward claims; first Lil' zik provenance
uses that count. Duplicate Open/Search and reconnect cannot award another claim.

Host test: finish Verzik in a development preview to inspect the stairs/vault and an empty chest.
For actual loot, finish all six prep targets in a normal run. Test two accounts: each should have
Open only on their own chest; opening one must change its model for both players. Repeat with
full inventory, double clicks, one disconnected member, and everyone disconnected before claiming.
Finally use the crystal. **Rebuild the client, restart the server, and hard-refresh**: the shared
cache decorator now removes Open from teammate chest forms. Database updates are automatic;
do not replace or delete the existing database.
