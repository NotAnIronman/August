# Pestilent Bloat encounter

This patch adds Bloat mechanics without changing the client or protocol. Pull the updated
files onto the host and restart the server; no client rebuild is needed for this patch.
Keep the current database and animation-editor data. Maiden, party order, boss bars,
room progression, and vault rewards remain in place.

## Behavior

- Passing the entrance barrier starts the encounter and admits that player. Later party
  members join by passing the same barrier. Outside players and other instances are excluded.
- NPC 8359 follows a cardinal 5x5-footprint loop around the tank, starting at 3299,4447.
  Direction is random. He cannot chase, be frozen/bound/stunned, or be knocked off the loop.
  Running uses normal validated two-step movement, with single steps at tight corners where
  a two-step turn cannot be encoded as a run by the movement protocol.
- First active period is 38–46 ticks. Later periods are 34–42, plus four when no hitsplat
  reached him during the preceding down. Reversals have a 32-active-tick cooldown, retained
  over shutdowns, and prevent shutdown for five ticks afterward.
- 40–60% HP runs; above 60% walks. Below 40%, each player hitsplat toggles run/walk parity,
  including separate components of multi-hit attacks.
- Active incoming damage is halved and floored per hit. Shutdown restores full damage for
  32 ticks. Stomp hits on down tick 30 and restores Defence, not HP or other drained stats.
- Flies roll 10–20 per tick; Protect from Missiles reduces damage 25%, rounded down.
  All five tiles on Bloat's closest edge are considered for visibility. Direct victims can
  spread flies once to other visible players; secondary victims cannot spread again.
  Multiple sources never duplicate a player's hit in the same tick.
- Stomp rolls 40–80, checks LOS on impact, and can be avoided behind the tank. Both flies
  and stomp cap queued damage to pre-impact HP so food before impact can save a player.
- Below 90% HP, hands fall only during active phases. Waves contain up to 16 distinct tiles,
  six ticks apart above/equal to 60% HP and four below. They never target the tank, outside
  the supplied arena bounds, or the previous wave's tiles. Already falling hands can land
  during shutdown. Hands hit for 30–50 and stun for five ticks.
- Full wipes reset the unfinished boss to his spawn; death, disposal, and wipes clear
  owned hazards and pending damage. Timed visuals are scoped to the room instance.

Bloat already has the undead tag and existing salve bonuses, melee-friendly defensive
bonuses, high magic/ranged resistance, and party-scaled HP (1500/1750/2000).

## Native assets and tuning

The flies are **spot animations, not NPCs**: 1568 (large), 1569 (small/spread).
Falling flesh is 1570–1573, stun is 1575, and impact blood is 1576.
The native falling sequence 8088 first reaches the ground at client cycle 96, so damage
is scheduled on game tick four (120 client cycles). Its entire visual lasts 168 cycles.
Idle/walk come from NPC cache sequences 8080/8081. Shutdown reads the animation editor's
case-insensitive `ShutDown` named special, then the existing first special, then 8082.
The editor's file is never rewritten.

Asset identities were cross-checked against the
[RuneLite game values](https://github.com/runelite/runelite/blob/master/runelite-api/src/main/java/net/runelite/api/gameval/SpotanimID.java)
and the local cache. Supplemental LOS, one-hop spread, fly rolls and hand cadence follow the
[wiki mechanics notes](https://oldschool.runescape.wiki/w/User:Mc/Mechanics/ToB).
The requested 38–46/34–42-plus-four movement timing takes precedence where those notes differ.

Initial tuning choices, not claims of exact official parity: uniform random active durations;
5% reversal chance each eligible tick; uniformly selected hand positions within the supplied
floor bounds rather than the official fixed-center distribution; five-tick hand stun.
These live in `BloatEncounter.ts` for play-test adjustments.

## Host test

1. Enter Bloat and follow him around the tank in both directions. Try walking underneath
   and attacking while he moves; he must stay on the loop.
2. Use `::maxhit` to compare damage while moving versus down (e.g. 21 becomes 10).
3. Verify the boss bar stays visible and the first down occurs after roughly 23–28 seconds.
   Attack during one down and skip another to compare subsequent walk durations.
4. Hide behind the tank for flies/stomp; then test with a teammate visible to you and Bloat
   to confirm spread. Compare fly damage with and without Protect from Missiles.
5. Push below 90%, 60%, and 40%. Check shadows, hand landing/damage synchronization,
   stun recovery, faster waves, and hit-driven running changes.
6. Wipe, re-enter, then kill Bloat. No old hands should survive, and the next room should unlock.

Automated tests cover timing boundaries, full-size real-cache routing and actual movement,
private-view LOS, one-hop spread, prayer, tick-eating, hand bounds/delay, hit parity, cleanup,
boss preparation, Maiden regressions, room progression, and vault rewards. Visual feel still
needs the host play-test above.
