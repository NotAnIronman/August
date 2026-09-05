# Playtester fixes — September 4, 2026

## Implemented

- Both native keybinding menus now commit selections to the character-backed binding varbits. Assigning an occupied key clears its previous tab, and choosing None clears the binding. The cache's native key-to-tab script remains responsible for switching tabs.
- Desktop layout choices now send a validated setting request to the server, remount interfaces using the current cache's component positions, and persist the preferred mode on the character. Fixed Classic uses a 765 × 503 canvas; Resizable Classic and Resizable Modern use their respective roots. Mobile keeps its dedicated root.
- Music has a compatibility output path when AudioWorklet is unavailable, including public HTTP origins. It runs the same bundled MIDI synthesizer. Browser audio still needs a user gesture and nonzero music volume. This does not make HTTP transport secure.
- The sidebar backdrop no longer captures clicks across the game. Sidebar controls themselves remain interactive.
- Removed the floating developer panel from the game shell. Draw distance, frame limit, camera speed, statistics and optional debug IDs are available in the plugin sidebar. Keybindings, layout and audio remain in native Settings.
- The XP orb sends the desired visibility explicitly, and the server hides the actual XP interface mount. Both normal and collapsed minimap controls are handled.
- Imported looting-bag drops require Wilderness eligibility, including supported underground Wilderness areas. Rat's tail is awarded only by the existing Witch's Potion quest handler at the ingredient-collection stage, never again by an unconditional loot-table roll. Quest bones are withheld unless their authored quest is active and the player does not already own the raw or polished bone.

Rag and Bone Man I/II are not currently authored in the quest registry. Their bone drops therefore remain disabled. Their eventual implementation must also account for individual bones already handed in. This was a targeted audit of the reported drops, not certification of every imported quest item.

## Layout dropdown follow-up

The uploaded live trace showed the compact Settings tab (group 116), with
onClick script 4568 and onOp script 4569. The original layout bridge only
covered All Settings (group 134, script 3852); it did not cover this compact
dropdown. Script 4569 updates its label, closes the list and schedules a
refresh, but has no layout-setting implementation for setting 12.

Compact layout selections now use a native widget-event completion hook and
the same desktop layout request as All Settings. The bridge matches group 116,
script 4569, enum 3509, setting 12 and one-based option children 1–3. It ignores
other settings and non-primary operations. Mobile retains root 601.

The cache-backed regression reproduces the original snap-back with the bridge
disabled, then verifies all three modes retain their selection with it enabled,
including legacy listener arrays. All 47 standard client test files, client
app/test typechecks, and two focused server layout/protocol tests pass.
The follow-up production client build succeeded (`main.f8b4af6f.js`).

This follow-up changes client code only. Rebuild the client on the hosting
machine after syncing source changes, then hard-refresh the browser. Generated
build files are not transferred by Git. The uploaded trace is preserved in
`apps/docs/layout-debug-trace.txt`. Live playtesting of this follow-up is still
required; the automated reproduction is not a claim of live PC/phone testing.

## Reported object IDs

Read directly from the project's revision-237 object cache:

| ID | Cache definition | Relevant detail |
| --- | --- | --- |
| 19138 | Unnamed, state-dependent object | No base model; varbit 2869 selects an absent state or object 19130. |
| 19118 | Unnamed scenery | Model 11800, no actions; clipping metadata present. |
| 47358 | Cave | Model 4523, no actions; clipping metadata present. |
| 16438 | Unnamed scenery | Model 1105, no actions; ambient sound 2184 and clipping metadata. |
| 25578 | Star chart | Model 27018 with a Look-at action. |
| 15578 | Red Banana Tree | Four models, no actions; clipping metadata present. |
| 47398 | Shelves | Model 47764, no actions; clipping metadata present. |
| 7458 | Unnamed scenery | Model 37243, no actions; clipping metadata present. |

These are not all collision-only objects. Debug IDs were enabled by default, exposing unnamed/internal scenery in menus. They are now opt-in. Two interaction paths also incorrectly fell back to a base object when its current transform was absent; both now exclude that absent object.

No scenery placements, cache definitions or collision data were deleted. A definition lookup alone does not establish that a named object belongs at the reported Lumbridge location. If Star chart or Red Banana Tree still appears there in normal interaction, capture the exact tile, plane and screenshot to trace the placement separately.

## Verification and manual acceptance

Regression coverage includes real-cache native dropdown creation and key-to-tab dispatch, duplicate reassignment, None, layout remounts and saved preference, explicit XP visibility, protocol validation, quest-stage exclusions, Wilderness bag eligibility, absent object transforms, and audio generated by the actual bundled DSP without AudioWorklet.

Completed checks: 185 standard server test files, 46 standard client test files, all four additional cache-dependent test files, the tooling test, repository checks, and all package/tools/server/client typechecks passed. The production client compiled successfully (`main.3e99408b.js`). Existing build-tool deprecation and bundle-size notices remain; live gameplay is a separate acceptance gate.

Live PC/phone gameplay and audible output have not been verified in this pass. Before release:

1. Assign every tab a key, reassign a duplicate, choose None, reopen Settings, relog, then log into the same character on another device. Verify the correct tabs respond.
2. Switch all three desktop layouts and exercise inventory, spellbook, chat, bank, and modal interfaces. Relog to verify the selected mode is restored.
3. On the public HTTP URL, click or tap into the game and confirm audible music, volume changes, and track changes.
4. Leave the plugin sidebar open and walk, right-click and use keybindings in the exposed game area. Verify sidebar controls still work.
5. Toggle XP visibility in both minimap modes, change layouts, and relog.
6. Kill rats before, during and after Witch's Potion's ingredient stage. Verify no duplicate tails, no unavailable-quest bones, and no looting-bag drops outside the Wilderness.

Deploy the matching server and rebuilt client together because this change adds a client-setting protocol message. Restart the server and reload clients so they obtain the new bundle. No live server restart or deployment was performed by this change.
