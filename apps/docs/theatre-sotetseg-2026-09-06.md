# Theatre: Sotetseg and rendering repairs — 2026-09-06

## Deployment

Rebuild the client on the host, restart the server, and reload the browser. Both client and
server changes are required. Use a fresh raid/room attempt. No database migration is needed.
Verified production client: `main.fd331cca.js`.

## Reported bugs

- Supply chests at 3269,4449,0 and 3281,4293,0 now sample the original raised floor when
  added to a bridge-linked scene. Both native floors are plane 1 at height -840, while
  gameplay remains plane 0. Dynamic model injection also completes lighting for models
  that need it. Preview instances show the chests too; purchasing still requires a real run.
- Nylocas tunnel paths now survive the NPC manager's collision-pruning stage. The narrow
  inward-only exception does not bypass freezes, apply to players, or persist in the arena.
- NPC presentation changes update the live client ECS type and animation state as well as
  the worker-built mesh. Vasilias switches between 8355 (melee), 8356 (magic), 8357 (ranged)
  without changing its server identity or losing its HP.
- Loot chest widgets now populate the rotation fields actually consumed by the renderer:
  85/2048 turns forward (~15 degrees), 1792/2048 turns around the vertical axis (-45 degrees).
  The old angle aliases alone did not affect rendering. A cache-pixel preview was inspected.

## Sotetseg

- Five-tick attack clock. Melee uses the combat accuracy evaluator, max 45, halved with
  Protect from Melee (max 22). Magic ignores accuracy, rolls 0–50, and is fully blocked by
  the correct prayer at impact. The first magic target branches to up to two living teammates:
  a black ranged projectile and a red magic projectile.
- Incorrect protection disables only protection prayers for five ticks. Other prayers remain active.
- After ten magic casts the next attack is the large red ball, with the target announced to
  everyone fighting. Living arena members within one tile of its target share the damage.
  Initial damage formula is floor(70 × living / soakers²), including 70 solo. Per the requested
  rule, an unshared group ball deals at least 121 and at least the target's current HP.
- Initial projectile travel tuning: three ticks for the first magic orb, two for branches,
  six for the shared ball. Tornado damage is initially 60–80 per contact tick, radius one.
  These unspecified details are isolated for play-test tuning, not claimed as exact parity.
- Health gates at two-thirds and one-third prevent a large hit skipping a maze. Entering a
  maze cancels all pending boss damage, clears player targets, and blocks new boss damage.
- Cache-verified grid: x3273–3286, y4310–4324 (210 native tiles). A randomized connected path
  crosses all 15 rows, with horizontal turns. Players begin immediately south at y4309.
- No second instance is created. The chosen runner has a private red path (33036) and is
  hidden from teammates/spectators by recipient-specific player sync. The runner still sees
  themselves. Their occupied tile is shown to teammates using the same native tile model
  as a one-tick owner-scoped graphic, avoiding a full scene rebuild on every step.
- Runner chip damage is 1–3 every seven ticks until they finish. Wrong occupied tiles damage
  nearby real-world players by floor(current HP / 15) + 15 per tick. Runner mistakes only
  affect the runner, never their teammates. End-of-tick position checks allow diagonal/L skips.
- The native tornado (8389) appears when a real-world player reaches row four, or the runner
  does so in solo. It advances along the path one tile per tick. Retreating below row four
  clears it while no other unfinished player is past that row. It is hidden from a party's runner.
- Native portal 33037 appears beyond the last row. Crossing the actual path endpoint or
  entering the portal marks that player finished. Everyone still alive must finish before
  combat resumes and Sotetseg's drained Defence is restored.
- If the runner disconnects/dies, another living player receives the same path. Rejoining
  participants start at the south edge. Wipe, kill, instance destruction, and module cleanup
  remove maze objects, tornado, delayed attacks, private views, and damage filters.

## Validation and testing

Automated tests cover all six Nylo lane routes through the actual NPC manager, freezing,
native chest models/heights, copied-room private floor overrides, native maze collision,
three live Vasilias forms, loot widget rotation fields, solo/duo/five-player mazes, prayer
locks, damage sharing, phase cancellation, tornado retreat, runner loss, and cleanup.
Network tests exercise the real player encoder and private-effect broadcaster.

In-game multiplayer validation is still needed. Suggested order:

1. Check both supply chests, Nylo tunnel movement and all three Vasilias appearances.
2. Check the loot chest angle in Theatre/Barrows/Moons windows.
3. Fight Sotetseg solo, then duo: prayer flicks, a shared/unshared large ball, both mazes.
4. Confirm the runner sees a complete red path while their teammate sees only the current
   tile. Test fourth-row retreat, diagonal running, endpoint crossing, and a runner disconnect.
5. Test a death and full wipe during a maze, then re-enter to check for leftover effects.

Mechanics research: [Sotetseg](https://oldschool.runescape.wiki/w/Sotetseg) and
[community mechanics notes](https://oldschool.runescape.wiki/w/User:Mc/Mechanics/ToB).
Native IDs were checked against the local revision-237 cache and
[RuneLite game-value constants](https://github.com/runelite/runelite/tree/master/runelite-api/src/main/java/net/runelite/api/gameval).
