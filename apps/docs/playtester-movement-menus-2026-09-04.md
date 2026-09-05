# Movement, combat and world-menu follow-up

## Implemented

- NPC overlap recovery obeys idle roam/combat leash limits. Spawn recovery takes precedence over overlap escape, preventing repeated walk-under clicks from displacing an NPC indefinitely.
- Aggression searches reserve a single-combat player during the same tick. Both actors must be in multi to bypass this restriction.
- Combat processing checks the engagement before pursuing or preparing an attack; preparation records it before delayed hits arrive. Reciprocal retaliation recognizes the same opponent regardless of which actor initiated combat. Registry cleanup runs at most once per tick.
- Follow and Trade are lower-priority player options; normal player left-click is Walk here. Existing PvP attack preferences remain authoritative.
- Explicit walking resets combat/follow interaction intent, facing target, pending face-tile update and forced rotation, including when a rejected NPC click has no entry in the interaction map.
- Following uses exact destinations, prioritizes the target's previous adjacent tile, rejects paths through the target, checks collision for overlap recovery, and clears obsolete paths when no route exists. Self-follow and cross-world-view follow/trade are rejected.
- Object-index refreshes no longer clear arrays in place. Reusing an aliased payload previously erased the entire map square's pickable-object index while leaving its rendered scenery intact. Refresh also restores previously missing metadata. Both full-scene and loc/door refreshes use the same helper.
- Object picking retries when model loaders become ready instead of permanently caching an initialization-time failure.

## Menu Entry Swapper

A native web-client implementation in the existing plugin sidebar, not a Java RuneLite plugin loaded into the browser. It follows the default/shift-click customization concept documented in the [RuneLite Menu Entry Swapper guide](https://github.com/runelite/runelite/wiki/Menu-Entry-Swapper).

Current scope:

- NPCs, world objects and ground items.
- Hold Shift and right-click, then choose **Swap left-click** or **Swap shift-click** and an existing action.
- Optional Bank, Trade, Travel and quick-action presets; custom choices take precedence.
- Preferences saved in browser-local storage. Reset a target through its menu or the sidebar.
- Original NPC index, object/item ID, coordinates, action slot, opcode and handler are preserved.
- Does not manufacture unavailable actions, override item/spell targeting, promote Attack or bypass server restrictions.
- Stacked entities retain their relative priority. Disabled/deprioritized ground-item actions remain protected.

This is not full RuneLite feature parity: inventory/equipment, bank withdrawal/deposit and shop UI swaps are not implemented in this pass. Those menus have separate widget dispatch paths and must not be treated as world-entity operations.

## Regression coverage

- `playtester-movement-combat.test.ts`: simultaneous attack preparation/aggression, reciprocal retaliation, timeout release, multi boundaries, overlap leashes, exact follow destinations, blocked overlap, private views and explicit walk-facing reset.
- `map-object-metadata.test.ts`: reproduces the disappearing object index with the original code, then verifies aliased/repeated payloads and recovery from absent metadata.
- `object-picking-cache.test.ts`: real revision-237 definitions/model geometry, delayed loader readiness and actions through the actual world-menu builder with debug IDs disabled.
- `menu-entry-swapper.test.ts`: persistence, left/shift preferences, unavailable actions, targeting safeguards, original packet metadata and first Shift-right-click configuration.

Automated checks are not a claim of live PC/phone playtesting. In particular, the reproduced scene-index failure matches missing object menus but has not been observed directly on the user's running host.

Completed checks: 186 standard server test files, 50 standard client test files, additional focused reruns after the final aggression/follow adjustments, client and server runtime/test typechecks, repository checks, and diagnostic-script syntax validation. The production client compiled successfully as `main.7b5d615f.js` (917,242 gzip bytes, under the repository's 1 MiB artifact limit). Existing build-tool deprecation and general bundle-size notices remain; the new plugin's lint warnings were resolved.

Local validation caveat: after the final build, OneDrive exposed `build/static/js` and `build/static/css` as reparse/symbolic-link directories. The root artifact check skipped these and reported no main bundle. Auditing the JavaScript directory directly passed (3,365,230 raw bytes; 917,242 gzip bytes); the CSS directory contains only the generated CSS file. The recursive checker's handling of synced directories remains a tooling follow-up, not a failed compilation.

## Host testing

1. Sync the changed source files, including new files.
2. Rebuild the client with `pnpm --filter @august/client build`.
3. Restart the server using its usual launch command. These fixes contain server changes as well as client changes; restarting alone does not rebuild the browser bundle.
4. Hard-refresh/reload the browser. Previously erased in-memory object indices need a map reload; no account/cache deletion is required.
5. Test repeated eastward walk-under at NPC roam/leash edges; simultaneous aggressive enemies in singles and multi; moving away after rejected attacks; following around corners and while running.
6. Test doors, trees, rocks and other object menus before and after dynamic scene updates. Test the plugin's first Shift-right-click, custom selection, relog persistence and reset.

If object menus are still absent, use [world-menu-debug.txt](world-menu-debug.txt) in the host browser's Console and right-click an affected object. The read-only report includes object-index counts, raycast hits, transform/action data and UI blocking state, not account storage or packet contents. Refresh or call `window.stopWorldMenuTrace()` to remove the temporary hooks.

No live deployment, live server restart, Git commit or push was performed.
