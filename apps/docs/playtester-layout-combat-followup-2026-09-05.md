# Layout, input, Araxxor and status follow-up — 2026-09-05

The subsequent [layout/input root-cause fix](playtester-layout-input-root-causes-2026-09-05.md)
supersedes this document's layout diagnosis and Brave Shift-right-click test expectations.

This batch supersedes the layout/input, egg-pose and Mirrorback rules in [the previous update](playtester-layout-pets-2026-09-05.md).

## Host update

Sync the complete source changes to the host, rebuild the client, then restart the game server using your normal command:

```powershell
pnpm --filter @august/client build
```

The server runs TypeScript directly; it does not need a separate emitted build. Both client and server changed, including shared status-display variables. Players should hard-refresh once for the new bundle. Do not clear player saves or rebuild the game cache. Layout switching itself should not require reloading.

## Root causes and changes

- **Layout:** `triggerOnSubChange` directly invoked callbacks for every cached interface, including detached gameframes. Those callbacks bypassed the previous queued-event guard and could overwrite shared tab state. Only mounted interfaces now receive these callbacks. Root replacement also clears held/dragged widgets and hover state; stationary-pointer hit testing refreshes each client cycle.
- **Browser menu:** document-capture handlers cancel secondary-button pointer and context-menu defaults within the game surface. The pointer handler explicitly delivers the game right-click because cancelling pointer defaults can suppress compatibility mouse events. Teardown removes the handlers; native menus outside the game remain available. Browser-reserved gestures and extensions still require live Brave verification.
- **Missing arena clicks:** removed legacy fixed-size UI exclusion rectangles that blocked visible world space. World input now uses the actual widget hit test, including modal capture.
- **Movement/facing:** a walk command clears combat interactions and forced facing even if movement is currently blocked. Auto-retaliation cannot reclaim a target on that walk tick or while the player has an active path. Client movement orientation takes precedence over interaction-facing while moving.
- **Melee pursuit:** retain a queued approach when its endpoint still touches the moving target's current edge. Replan when that endpoint becomes invalid, and discard the obsolete path if replanning fails. This targets unnecessary path replacement; it does not replace network interpolation or the pathfinder.
- **Eggs:** cache NPCs 13670/13672/13674 have no morph transforms. Sequence 11507 is a single-frame closed-egg pose; displaying the unposed model exposed its alternate geometry. Restore that static pose while continuing to suppress locomotion and action animations.
- **Mirrorback:** redirect `floor(original hit / 5)` from boss to mirrorback; recoil half of the damage actually received, rounded down and capped by its remaining HP. A 100-point hit normally becomes 80 boss / 20 mirrorback / 10 player. Direct-hit recoil and qualifying max-hit rules are unchanged.
- **Araxxor pools:** acid and permanent enrage pools explicitly use venom hitsplats. Other encounters retain the default hazard hitsplat.

## Poison, venom and cures

- Venom continues until cured: 6 damage initially, increasing by 2 every 30 game ticks (18 seconds at 600 ms), capped at 20. With the first hit after 18 seconds, the first 20 occurs at 144 seconds; the 162-second hit is also 20.
- Poison decreases by one damage after five hits at each strength, then expires. Re-exposure to stronger poison can increase it again.
- One antipoison dose downgrades venom to poison at its current scheduled damage. Another dose cures that poison. Anti-venom variants fully cure both and provide timed immunity.
- The orb's native **Cure** action selects a supported inventory potion and uses the normal queued consumption path, including dose replacement and consumption delays. For venom it prefers a full anti-venom cure, falling back to antipoison. No available potion produces a message without consuming anything.
- All four doses of antipoison, superantipoison, antidote+, antidote++, anti-venom, anti-venom+ and extended anti-venom+ were checked against the project cache.
- Existing Guthix rest and Sanfew serum consumption now downgrades venom. Strange fruit fully cures venom/poison and gives 18 seconds of venom immunity.
- Charged serpentine, tanzanite and magma helmets prevent poison/venom status; encounter applications now respect this check too. Environmental pool impact damage remains separate from status immunity.
- Hovering over the health orb shows elapsed status duration, next damage/countdown, and either poison time remaining or **Lasts until cured**. Transient custom varps 7800–7802 were checked not to collide with this cache's variables.

### Remaining cure content

Cure Me, prayer-book curing with a holy/hallowed symbol, and cooked moonlight antelope's delayed healing do not have gameplay handlers in the current project. Those content implementations remain outstanding; this batch does not claim they work. Orb auto-selection currently covers the potion families above, not every alternative food/spell/item cure.

## Host QA checklist

1. In one desktop session, switch Classic Fixed → Classic Resizable → Modern Resizable → back, repeatedly. Click every tab and type in chat after each switch, without reloading. Repeat with the plugin sidebar open and the pointer stationary over a tab. Check mobile separately because its layout differs.
2. In Brave, test Shift-right-click and normal right-click over world, inventory and tab controls. Confirm no browser image menu, the game menu still opens, and middle-drag camera controls work. Native context menus outside the game must remain available.
3. Click around the full visible Araxxor arena, especially the bottom-right area after collapsing/changing the side panel. Confirm each valid ground click shows feedback and paths normally. Click inventory/minimap/chat too, to check world clicks do not leak through UI.
4. Try attacking invulnerable Blue Moon, then walk away with auto-retaliate on/off. Repeat while receiving a hit and while frozen. Walking must cancel the old target; frozen players must not move until permitted.
5. Chase a moving multi-tile NPC with melee; confirm paths stay smooth on a valid approach, update when the target moves away, and handle collision without walking an obsolete route.
6. Observe each egg colour through spawn and hatching: closed stationary pose, no action animations. With a healthy mirrorback, verify 100 damage produces the 80/20/10 split; repeat near its death. Check pool hitsplats separately from ordinary melee.
7. Apply venom, observe several rising hits and the hover countdown. Click Cure with antivenom available; repeat with only antipoison and confirm poison at the same scheduled damage, then cure again. Verify exactly one dose changes per accepted drink.
8. Check strange fruit, Guthix rest and Sanfew serum while venomed; repeat status application during and after immunity. Equip a charged serpentine helmet and verify poison/venom cannot persist. Let low-strength poison wear off without reinfection.

## Verification scope

The full client suite passed all 53 files. The standard server suite passed all 192 files; the subsequent expanded suite passed 194 of 195, with `ensure-cache-publish.test.ts` failing intermittently and passing on its isolated rerun. The failure's cause was not established; this is not reported as an entirely clean expanded run. Workspace-wide typechecks, repository checks, the production client build and its artifact budget passed.

Automated tests include real-cache layout packet transactions, native tab operations, cold-script recovery, input listener lifecycle, health tooltip state, status damage curves/cure dose selection, Mirrorback calculations, retaliation cancellation and real collision-aware melee routing. Production client compilation and artifact-size auditing are also performed.

These are code/cache regressions, not a live rendered-browser playtest. The host QA above remains necessary, particularly for Brave's native menu behavior and visual layout correctness.
