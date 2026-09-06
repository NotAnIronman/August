# Maiden encounter testing

Maiden and [Bloat](theatre-bloat.md) now have encounter mechanics; the other four bosses remain preparation targets.
Rebuild the client, restart the server, and hard-refresh after deploying this patch.
Both sides must be updated together: cosmetic NPC phase updates and timed floor graphics
extend the binary protocol. Do not replace the database or animation editor data.

## Room-entry rendering repair

The first encounter patch mounted the party HUD into 161:17 for every desktop layout.
On Fixed or Resizable Modern, preloading that inactive root replaced the client's active
viewport with an unlaid-out 0x0 widget, collapsing the 3D scene while the minimap kept working.
HUD destinations now follow the actual layout's cache mapping, and inactive widget groups
cannot replace the active viewport. Switching back to a cached layout explicitly restores
that layout's viewport reference.

The reported `SceneLocs` errors at 22,17 on level 2 were a separate lighting omission:
bridge replicas survived on a plane whose primary tile had moved down. Lighting now includes
replica-only tiles, restoring four Maiden decorations. The cache test now builds complete
room models, not only terrain/collision, and rejects unknown render entities.

After updating, rebuild the client, restart the server and hard-refresh. Enter Maiden using
Fixed, Resizable Classic and Resizable Modern, then switch layouts inside the room. Check
that the scene and HUD remain visible without a reload. Mobile mapping is also covered by
the automated real-cache test.

## Implemented behavior

- Native cache interface 28 displays party orbs in saved leader/join order, matching vault
  chest slots. Health, death and disconnected states update; reconnecting does not reorder
  the roster. Layout changes remount the HUD.
- Maiden keeps Defence 200 and Magic 350. Her encounter controls attacks instead of generic
  NPC melee. Attacks are ten ticks apart. Blackstorm selects distance first, then north/east
  side, then orb order. It bypasses accuracy and rolls 0 through
  `floor(36.5 + 3.5 * absorbed healers)`, as confirmed by the user. Protect from Magic halves
  the launch damage. Damage is not capped to the player's health at launch.
- Blackstorm has a 50% stat-drain chance. Highest attack bonus at launch selects Magic,
  Ranged, or Attack and Strength; the drain is `floor((actual damage + 1) / 5)`.
- Crossing 70%, 50% and 30% health changes the existing boss's appearance without replacing
  her identity, health or attack target. Each threshold summons two healers per roster slot,
  once only. Healers have 150 HP for one to three players, 175 for four, and 200 for five.
  They follow collision-aware routes, respect freezes, and heal Maiden for twice their
  remaining health when absorbed. Each absorption increases subsequent attack damage.
- Player-targeted splats land on the original tiles, with two extra random tiles around one
  player. At least two Blackstorms separate splat attacks. Blood damages players, heals
  Maiden and drains prayer. Blood spawns have 120 HP, roam, and leave timed trails.
- Adds, pending hits and damaging/visible blood are isolated to the party instance and
  cleared on death or a full wipe. A wipe resets the unfinished encounter, not completed rooms.

The fifth healer pair shares the fourth pair's farthest tiles as requested. The cache's
2x2 healer footprint at x3187 overlaps the east wall at x3188, so the farthest pair actually
spawns at **3186,4435** and **3186,4457**. Real-cache path tests cover all ten routes.

Animations use the editor's canonical Maiden (8360) primary magic assignment and named
`idle` / `splat` specials, with fallback sequences 8091 / 8090 / 8092 respectively.
Existing assignments are not overwritten. Healers use NPC 8366 and blood spawns use 8367.
Native graphics 1577, 1578 and 1579 provide Blackstorm, splats and lingering blood;
these were checked against the cache and the
[RuneLite graphics definitions](https://raw.githubusercontent.com/runelite/runelite/master/runelite-api/src/main/java/net/runelite/api/gameval/SpotanimID.java).
Blood's native six-second animation is explicitly kept visible for the hazard's full lifetime.

## Tunable first-pass choices

The request did not specify all timings and amounts. Current defaults, not claims of exact
official-game parity, are: 25% splat selection chance when eligible; 50-tick stationary splats;
34–50-tick trails; Blackstorm projectile travel of at least one tick, otherwise footprint distance divided
by three rounded up; splats arrive and become harmful exactly two ticks after launch;
prayer drain equal to actual blood damage; and at most eight live blood
spawns. These are localized in `MaidenEncounter.ts` for play-test adjustments.
Spawn chance is 10% without stepping, rising to 20% total if stepped on, not a fresh roll each tick.

## Host smoke test

Theatre rooms now publish their live boss bar through the shared boss HUD, including
Maiden's 70/50/30 healer markers. It updates on damage/healing/phase changes and clears
on death, leaving, or instance disposal; it does not replace the party-orb interface.

Developer accounts can use `::maxhit` to toggle guaranteed maximum rolls against NPCs,
or `::maxhit on` / `::maxhit off`. Enabling it disables `::insta`. Normal attack and special
formulas still determine the maximum; boss mitigation and damage caps still apply.

The follow camera no longer lets terrain pressure change its selected orbit distance/pitch.
It still follows actual player floor height and retains manual camera controls and roof hiding.
Test the raised back wall at several zoom/pitch settings, not only the default view.

1. Enter Maiden solo. Confirm the orb/name and phase-one appearance. Wait for Blackstorm,
   then repeat with Protect from Magic and different equipment bonuses.
2. Trigger 70%, 50% and 30%. Check phase appearances, healer spawns, Ice Barrage freezes,
   and absorption healing. Healing Maiden back above a threshold must not repeat that wave.
3. Dodge splats, then deliberately stand on blood. Verify damage, prayer loss, boss healing,
   blood spawns, and that visuals remain until the tile is safe.
4. Repeat with five players: ten healers per wave, shared farthest pair, stable orb order and
   targeting ties. Leave one player outside the barrier: they must not be targeted.
5. Run another party at the same coordinates; neither party should see the other's blood or
   projectiles. Disconnect/rejoin one member and switch client layouts to verify HUD recovery.
6. Wipe, retry, then kill Maiden. No old blood, adds or delayed damage should survive; Bloat
   progression should still work. Finish the raid and confirm chest order matches orb order.

Automated tests cover mechanics, native HUD scripts and assets, real collision routes,
phase-update packet round trips, timed blood rendering, instance isolation and vault regressions.
Live visuals, animation selections and encounter feel still require the host smoke test.
