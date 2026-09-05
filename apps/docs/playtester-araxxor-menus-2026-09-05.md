# Araxxor and client playtest fixes — 2026-09-05

## Implemented

- Araxxor creates one six-egg ring per encounter life. Hatched/destroyed eggs are not replenished, and the hatch clock stops after six slots.
- Ruptura stops on arrival, waits three server ticks, then explodes at its stopped position. Players can leave the blast area during the delay. Dead/despawned Rupturas cannot explode, and repeated attack callbacks cannot arm a second explosion.
- Ruptura checks every NPC owned by the boss encounter, including multiple minions of the same type. Distance is measured to an NPC's footprint rather than its southwest anchor. The script damage facade now sends NPC hitsplats as well as changing health and processing deaths.
- Enraged melee has two-tile reach and one-tile preferred approach distance. Its poison is a three-wide cardinal strip through the attacked tile, perpendicular to the boss-to-player direction. Poison persists until encounter cleanup. Repeated cleaves do not multiply poison on the same tile; expiring temporary acid cannot erase an overlapping permanent poison visual.
- Object picking retries streamed model misses. The picker previously cached an unavailable model permanently, even though the render worker could subsequently display that object.
- Layout changes retain pending root/subinterface mounts while assets download. Partial streamed widget definitions are not cached as completed interfaces. Late root onLoad retries from a different layout are ignored.
- Secondary-button mousedown now prevents the browser default action as well as contextmenu, while retaining the in-game Shift modifier and right-click event.
- Menu Entry Swapper can promote Pickpocket above ordinary Attack. Attack is not exposed as a custom choice; explicit right-click-only attack settings and active spell/item targeting stay protected.
- Inventory items and spellbook buttons now have saved left/Shift-click choices. The real primary-action resolver preserves the selected widget operation index. Inventory preferences do not apply to bank/trade containers. Preferences remain browser-local.
- Passive NPCs no longer step off arbitrary overlapping players. Combat overlap corrections consider only the combat target and break equal-distance ties toward the NPC's home rather than always east. Existing leash/collision restrictions remain.
- First character design completion grants the basic authored starter supplies once and persists that fact with inventory. Existing leagues starter supplies are topped up, not duplicated; leagues-only gear is preserved. Full-inventory failures roll back the entire grant. Existing completed characters are not automatically retroactively awarded supplies.

## Host update

Sync these source changes, rebuild the client, restart the server, and hard-refresh each browser:

```powershell
pnpm --config.verify-deps-before-run=false --filter @august/client build
```

Use the host's existing server start command after stopping its old process. Restarting the server alone does not update compiled client JavaScript. Do not clear player saves or browser asset storage for this update.

The build generated during this work is `main.98a7d39c.js`. Build output is ignored by Git; GitHub Desktop should show source changes, not the compiled bundle. “Restoring startup assets” is a normal cache-restoration progress message, not evidence that character data was erased.

## Verification and host checklist

Automated coverage includes the six-egg lifecycle, delayed Ruptura/AoE targeting, cardinal cleaves, permanent-hazard cleanup, overlapping poison visuals, streamed-model recovery, delayed widget mounts, native inventory/spell operation selection, NPC overlap movement, and starter persistence/rollback. Client/server typechecks and the production client build pass.

Completed checks: all 188 standard server test files, all 50 standard client test files, focused reruns for the expanded tests, both runtime/test typechecks, repository checks, and the client artifact audit (918,022 gzip bytes). The repository's standard suites exclude their existing optional cache-only tests. No live server restart, deployment, commit, or push was performed.

The affected external host and Brave UI have not been exercised live in this workspace. After updating:

1. Right-click a tree/door and use its primary action before and after a nearby door/object update. If options remain missing, capture `world-menu-debug.txt` output in a new file.
2. Swap classic → modern → classic without reloading. Verify all tab buttons remain visible and clickable, including when the alternative layout assets are initially cold.
3. Shift-right-click a Man, save Pickpocket, then left-click him. Repeat with inventory Drop/Eat and a spell action; verify the browser image menu stays closed in Brave.
4. Walk under a passive Man and under one in combat, including near its home boundary.
5. Fight Araxxor past all six hatches, lure Ruptura near the boss and multiple adds, dodge during its three-tick warning, and check poison persists throughout enrage but disappears on cleanup.
6. Complete design on a fresh character, check starter items, reconnect, and verify no duplicate grant. Test leagues separately to preserve its existing starting gear.
