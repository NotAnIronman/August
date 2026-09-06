# Playtester follow-up — 2026-09-06

## Implemented

- Theatre chests offer deposit-to-inventory, deposit-to-bank, and individual-loot menus. Partial quantities remain in the durable reward record. Account inventory/bank, collection log, pet queue, and claim state commit together. Stale/replayed claims are rejected; failed saves restore both containers. KC and pet delivery occur once, on the first successful claim.
- Corrected noted-item stackability: noted vials of blood (22447) were incorrectly non-stackable in generated server data. This caused empty inventories to reject normal reward stacks.
- FPS information is click-through and moved left of the desktop minimap.
- Instances can explicitly request multi-combat independently of party access. Both solo and party Moons/Scurrius instances request it; the native Scurrius lair is also multi. Party instances retain their default multi-combat behavior.
- Eclipse clears both the interaction-system target and forced facing at each teleport.
- Amethyst 11388/11389 uses adjacent reach without requiring passage across its wall edge. Bank chest 4483 explicitly handles its native Use option.
- Mining tools use distinct normal, ornamental, crystal, third-age, infernal, gilded, and black pickaxe sequences. Reference: [RuneLite animation constants](https://github.com/runelite/runelite/blob/master/runelite-api/src/main/java/net/runelite/api/AnimationID.java); sequence existence checked against the local cache.
- Autocasts now validate and spend runes in the combat engine. Spell execution recomputes live costs, including callers that formerly supplied only a spell definition. Staff rune substitutions remain supported.
- Twinflame elemental Bolt/Blast/Wave spells send two projectiles. The second arrives one tick later and echoes 40% of the first actual hit, rounded down. Echoes do not recurse, award XP, or execute another rune/charge-spending cast. Manual-spell/legacy hit paths are wired too; Strike and Surge are excluded.
- HTTP saved-account passwords have an explicit browser-local plaintext opt-in prompt after a successful login. Without consent only the username is saved. Secure browser crypto remains preferred; removing the saved account removes its stored password. HTTP is not a substitute for HTTPS transport security.
- Native private-message prompts now receive their keyboard events; only bank/trade amount prompts use the numeric input shim. This fixes Enter being intercepted before the CS2 message script runs.
- Dynamic 3D model texture indices now match map-worker indices. The shader already adds the reserved white layer; the main renderer had added it twice. Fire/infernal cape cache textures already correctly reference sprites 485/318. Inventory icon rendering was unaffected.

## Host testing

1. Copy/sync these source changes to the host, rebuild the client, and restart the server. Load the updated client with a hard refresh. No cache replacement is required.
2. Create fresh Scurrius/Moons instances. Have both party members attack Scurrius while he targets one; attack a blood jaguar while Blood Moon is engaged.
3. Test Theatre claims with full/partially full inventories, individual selection, bank deposit, closing/reopening the menu, and reconnecting after a partial claim.
4. Test Eclipse without clicking after a teleport, then with a deliberate click on each new position.
5. Mine both amethyst IDs and use bank chest 4483. Compare equipped mining tool animations.
6. Test manual and autocast Twinflame Bolt/Blast/Wave spells, missing runes, and exclusion of Strike/Surge. Verify one extra delayed hit and no extra XP/resource cost for it.
7. Send a private message after clicking an online friend. Compare equipped cape textures with their correct inventory icons.
8. On HTTP, accept plaintext saving only on a trusted device; log out and select the saved-account slot. Declining leaves the username-only behavior intact.

## Validation

Server/client typechecks, production client build, and targeted regression tests were run. Coverage includes real cache IDs/sequences, blocked-wall amethyst approach, native bank action dispatch, partial claim persistence/replay protection/bank rollback, party cleanup, target clearing, rune spending, echo scheduling/XP, private-message keyboard dispatch, dynamic texture packing, and saved-account opt-in storage. Multiplayer/browser gameplay still needs host playtesting; automated checks are not a claim of full in-game verification.
