# Theatre of Blood setup

The raid rooms, party rules, encounters and rewards are not implemented by this setup batch.
The user is gathering the object IDs and encounter requirements for the next steps.

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

## Development IDs

Open the xRSPS/plugin settings panel, scroll to **Development**, and enable
**Show object, NPC and item IDs**. Reopen the object's right-click menu and read the ID beside
Examine. This uses the existing debug-ID renderer and also reveals unnamed entities where
supported by that renderer. The toggle is saved locally per browser, with safe fallback when
browser storage is unavailable. It replaces the old Client graphics debug checkbox.

## Host smoke test

Sync all files, rebuild the client (`pnpm --filter @august/client build`), restart the game
server and hard-refresh once. No game-cache rebuild or account-storage clearing is needed.

1. Enable IDs, right-click several objects and note their Examine IDs. Reload and confirm the
   preference remains enabled. Disable it and verify the ordinary menu labels return.
2. Use each medallion option from inventory and equipment; verify the coordinates and plane,
   especially Slepe's underground destination on plane 1.
3. Confirm stale clicks after moving/removing the medallion do not teleport, and that existing
   teleport restrictions are still enforced. Normal Wear, Remove and Drop should remain intact.

Automated coverage checks the real cache options, destination mapping, inventory/equipment
ownership, rejection feedback, saved debug preferences, and Examine labels. Live destination
terrain and gameplay behavior still need the host smoke test.
