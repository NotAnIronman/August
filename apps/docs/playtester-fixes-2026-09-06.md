# Multiplayer playtest fixes — September 6, 2026

## Implemented

- Party instances register their private world view as multi-combat. Disposal removes that registration, so recycled view IDs cannot inherit it. Target selection, attack eligibility, area attacks and the multi indicator use the same rule.
- Theatre joins now run inside the raid's internal-transfer scope. Previously a joiner had not yet received a checkpoint, so ordinary teleport cleanup detached them from the instance immediately.
- Araxxor gives each qualifying party member a separate corpse claim. Required damage is 30% / 25% / 20% / 15% of maximum boss HP for parties of 2 / 3 / 4 / 5. Capped lethal-hit damage counts. Each eligible member gets killcount and each harvested reward is recorded in their collection log. Duplicate and cross-instance claims are rejected. The corpse remains until everyone claims, or its existing five-minute lifetime expires.
- Following stores the interaction target in the authoritative actor field, allowing later movement to send a clearing update. Teleports clear follow/combat interactions and forced facing; moving client actors no longer turn back toward an interaction target each frame.
- The Pirate's Treasure spade handler falls back to developer-authored dig transitions outside its quest-specific location/stage.
- Eclipse checks interaction-target/desired facing instead of stale server rotation. Correct facing grants a melee maximum-hit counter immediately, with the equipped weapon's animation, rather than a maximum-hit flag that was cleared by the next teleport before an attack could use it.
- Blood jaguars have bounded aggression/leash radii and belong to their instance. NPC aggression searches now visit occupied tiles rather than scanning every tile in a radius-squared loop. A malformed enormous radius can no longer hang that loop.
- Completed Moons persist as an account bitmask, saved immediately on defeat and cleared after chest rewards. Live encounters are not restored after a restart; completed fights are.
- Lunar common loot uses exactly 1 / 3 / 6 rolls for 1 / 2 / 3 completed Moons. Replaced inflated, completion-scaled quantities with weighted per-roll ranges. Existing per-Moon unique rolls and duplicate protection remain.
- Amethyst 11388 and 11389 are explicitly mapped as live crystals; empty variants are 11390 and 11391. Previously 11389 was incorrectly specified as the depleted rock.
- Bank chest 4483's first action, `Use`, opens the normal bank through the banking service.
- Dragonhide vambraces/chaps/bodies consume 1 / 2 / 3 leathers. Added Hueycoatl vambraces/coif/chaps/body recipes using 1 / 2 / 2 / 3 hides, with level and XP requirements from the wiki. They use the existing atomic production framework.
- The live combat engine now validates and consumes quiver ammunition when firing bows, crossbows and ballistas. The last projectile retains its visuals; no/incompatible ammo is rejected. All Ava's devices use August's requested 80% recovery rate, including blowpipe darts.
- Twinflame staff has a staff combat definition, six-tick autocast, unlimited water/fire rune substitutions and its standard-spell 10% accuracy/damage bonus. Elemental Bolt/Blast/Wave hits enqueue one 40%-damage echo a tick after impact, without recursive echoes or extra rune use. Strike/Surge do not echo. Automatic elemental-weakness selection is not added; the combat engine currently has no NPC elemental-weakness model.
- Private-message CS2 opcode now sends recipient/text through the binary protocol. The server resolves the recipient, respects their ignore list, and sends separate incoming/outgoing chat entries only to the two participants. Offline/unavailable recipients return a private error to the sender.

## Still pending user input

- **Cape textures:** need to distinguish worn model vs inventory icon, ideally with a screenshot. No speculative renderer patch made.
- **HTTP password saving:** existing encrypted storage requires `crypto.subtle`, unavailable on public HTTP. HTTPS retains encrypted local saving. Asked whether to keep that requirement or add explicitly warned, opt-in plaintext storage. No plaintext fallback added. HTTP also leaves the delivered client and connection exposed to network tampering; local encryption alone cannot make HTTP safe.

## Verification

- 17 targeted server test files passed, including independent Araxxor claims, live quiver consumption, Eclipse facing, Twinflame echo, private-message binary round trips, enormous aggression radius, party isolation, Theatre joins, persistent-state sanitization and cache IDs.
- Four client test files passed: direction/orientation, chat-channel prefix, Enter-to-type chat and saved-account storage.
- Server runtime/test and client application/test type checks passed, including the final additional server test fixtures.
- Client production build succeeded. Existing bundle-size and webpack/Node deprecation warnings remain.
- `git diff --check` passed.
- No live host deployment, player-account edits or two-player end-to-end session was performed.

## Host playtest

Transfer the source changes, rebuild the client on the host, restart the server, then reload both clients. The private-message wire change requires the new client and server together.

1. Create a Scurrius party: both players attack simultaneously.
2. Create Theatre party, join from another account: confirm both players see each other and the same NPCs in the instance; advance and reconnect.
3. Kill Araxxor with both above the duo threshold: harvest one after the other, verify separate loot/KC/logs and no duplicate claim. Repeat with one player below the threshold.
4. Follow, click away, then follow and teleport: verify facing is released.
5. Dig at an authored transition, test Eclipse facing counters, and trigger Blood jaguars.
6. Kill one/two Moons, restart the server, finish or claim. Confirm progress and 1/3/6-roll behavior across separate runs.
7. Test mineable amethyst, bank chest 4483, hide material shortages, every ammunition family, Ava's recovery and Twinflame Fire Bolt/Fire Wave versus Fire Strike/Fire Surge.
8. Exchange private messages both directions; test offline and ignored recipients.

## Data references

- [Hueycoatl hide recipes](https://oldschool.runescape.wiki/w/Hueycoatl_hide)
- [Twinflame staff](https://oldschool.runescape.wiki/w/Twinflame_staff)
- [Lunar Chest](https://oldschool.runescape.wiki/w/Lunar_Chest); standard-loot ranges cross-checked against the [wiki mirror](https://osrsindex.com/wiki/lunar-chest?site=osrs_wiki) where direct wiki retrieval was unavailable.
