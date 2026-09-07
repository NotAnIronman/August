# Theatre: Nylocas, supplies and recovery — 2026-09-06

## Deployment

Rebuild the client on the host, restart the server and reload the client. Test with a fresh raid.
The verified production bundle is `main.aab62818.js`. No manual database migration is required;
new run fields are optional and old records remain readable.

## Changes

- Loot chest models rotate another 15 degrees forward and 45 degrees left from the previous view.
  Only the bottom-right cache resize handle remains. Dragging still consumes the game click.
- Supply chests (32758) appear at 3269,4449,0 and 3281,4293,0. Their respective bosses must be
  defeated before supplies can be purchased. Points and purchases survive reconnects/restarts;
  purchasing commits the inventory and points in one SQLite transaction.
- Supplies use the requested potion/food prices. The initial performance rule is **13 points
  for no deaths in the preceding pair, 6 for one death, onion for two deaths**. This is a
  project tuning assumption, not a reproduction of the original game's detailed scoring.
  Awards happen on room completion, including for offline members. Unspent first-chest points
  carry forward even if the first chest was skipped. Onion-only checkpoints cannot spend points.
- Vault chest anchors, in roster order: 3233,4331; 3226,4327; 3240,4329; 3226,4323; 3240,4325.
- Unclaimed or unopened rewards remain attached to their original durable run. Object **41437
  at 3650,3217,0** opens the same reward interface outside, including partial inventory/bank claims.
  Multiple pending raids are handled oldest-first. Claiming never rerolls rewards or repeats pet/KC awards.
  The cache's blank 41437 definition uses the Theatre supply-chest model with a Claim option.
- Individual raid deaths retain carried items and respawn at the room entrance as a noncombatant.
  Passing back into that incomplete fight is blocked. Completion restores participation for the
  next room. Party advancement during the death animation uses the new room's entrance.
- A full-team wipe ends the run and ejects players to 3677,3219,0. Inventory and equipment are
  saved into recovery storage. Offline members are settled on account loading. Recovery uses
  the native northern chest **32656 at 3657,3223,0** and costs **100,000 coins per player**.
  Coins may be combined from inventory, bank and stored items. A partial reclaim is not charged twice.
  Existing unreclaimed items are preserved and moved into the Theatre recovery chest too.

## Nylocas first mechanics pass

- **Five waves per player**: 5/10/15/20/25 waves, fixed from the saved roster.
- Initial tuning: a wave every 8 ticks, three spiders per wave (one per tunnel), alternating
  the two supplied lane tiles. Every third wave replaces one spider with a large variant;
  the large-spider lane rotates. These composition/cadence values are tuneable, not supplied rules.
- At most 15 live adds. Pending split children have priority over further wave spawns.
- Small/large HP: 8/16 for up to three players, 9/19 for four, 11/22 for five. Max hits 17/24.
  Normal cache-backed combat stats and three-tick add attacks are configured.
- White/grey = melee, green = ranged, blue = magic. A wrong-style impact, including zero damage,
  permanently locks that player out of damaging that particular add. Other players are unaffected.
- Large kills split into two randomly coloured small spiders. Adds detonate 50 ticks after spawn;
  nearby players can take up to 18/21 damage. Detonation does not spawn split children.
- Cache collision blocks all six tunnel spawn routes. Only the owned spiders receive a bounded,
  inward-only movement exception. Player collision and the shared map remain unchanged; normal
  collision resumes once the spider's full footprint enters the arena.
- Vasilias is not published to clients before waves and split children finish. It then spawns at
  the existing boss anchor in melee form with scaled 2,500-base HP. It changes to a different
  style every 10 ticks and stops players targeting it on each change. Matching style damages it;
  wrong style does zero damage. The add-specific permanent lock is not applied to the boss.
- Vasilias attacks every four ticks: up to 70 off prayer, up to 17 with the matching ranged/magic
  protection, and zero with melee protection. Only its final death completes the room.
- Timers, adds, pending hits and traversal permissions are attempt-scoped and cleaned up on disposal.

## Validation

Passed server runtime and test typechecks, production client build, package boundaries and build-size checks.
Focused tests cover all roster sizes; wave count/cap/splits/expiry; actual movement frames through all six
cache tunnels for both footprints; colour locks; prayer damage; room admission/completion; durable reward
lookup and duplicate claims; inventory/bank/grave fee combinations; failed-save rollback; individual death
and team-wipe sequences; existing Maiden/Bloat/Guardians/Gryphon, movement and grave regressions.
Client tests cover model rendering at the new angles, resize ownership and repeated loot-menu dismissal.

Live solo/party playtesting is still required, particularly encounter pacing, chest approach routes,
projectile presentation and disconnect/reconnect during the fight.

## References

User-provided encounter rules take precedence over original-game behavior. Supplementary normal-mode
stats were checked against [Ischyros](https://oldschool.runescape.wiki/w/Nylocas_Ischyros),
[Toxobolos](https://oldschool.runescape.wiki/w/Nylocas_Toxobolos),
[Hagios](https://oldschool.runescape.wiki/w/Nylocas_Hagios) and
[Vasilias](https://oldschool.runescape.wiki/w/Nylocas_Vasilias).
Animation/effect identities were checked against RuneLite's public
[animation constants](https://github.com/runelite/runelite/blob/master/runelite-api/src/main/java/net/runelite/api/gameval/AnimationID.java)
and [effect constants](https://github.com/runelite/runelite/blob/master/runelite-api/src/main/java/net/runelite/api/gameval/SpotanimID.java),
then verified against the project's revision-237 cache.
