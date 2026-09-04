# Object picklocking assessment and implementation

Assessed 2026-09-04. This is a bounded foundation, not full OSRS Thieving parity.

## Evidence and counts

Pinned raw cache: OpenRS2 archive **2504**, **osrs-237_2026-03-25**, revision237, timestamp2026-03-25T11:45:05.720179Z. The raw census uses the undecorated engine factory, not the application menu overrides. `tools/diagnostics/audit-picklock-objects.ts` is read-only and resolves paths independently of the working directory.

- **65 native Pick-lock/Picklock definitions:** 37 doors/gates/trapdoors, 18 chests, 10 coffins/drawers. Exact IDs agree with `data/generated/cache/locs.json`: **zero missing snapshot IDs and zero snapshot-only IDs**.
- **12 morph parents** reference a direct picklock child; they are not 12 additional direct menu definitions.
- **8 ordinary Search for traps chest definitions**, 11735–11742, are separate from those65.
- The shared custom-content exact-ID menu aliases add11735/11736/11737, preserving native Open/Search for traps: **68 decorated direct definitions**, including21 chests.
- Implemented: HAM trapdoor; **7 door IDs at10 reviewed placements**; **3 chest IDs at14 reviewed placements**. Of the native65,8 have implemented object behavior,7 have requirements but no enabled physical route, and50 have no object implementation here.
- Map audit loaded2869 archives; **2868 decoded successfully**, one malformed/unavailable square `(98,199)`. Zero static placements is not proof of unused content: morph children and activity-created objects exist.

Cache meshes/placements prove the available geometry, not original server rules or canonical transform IDs. Matching open models below are explicitly reviewed visual substitutions. They were tested against raw collision, not inferred from names or neighboring numeric IDs. Elvarg reference data was not used as proof of current OSRS IDs.

## Working chests

| Closed ID | Level / XP | Fixed reward | Reset ticks | Reviewed placements `(x,y,plane;rotation)` |
|---|---|---|---|---|
|11735|13 /7.8|995 ×10|12|2612,3314,1;0 ·2673,3307,0;1 ·2630,3655,0;2 ·3044,3951,0;3 ·3044,3957,0;3 ·3188,3962,0;2 ·3189,3962,0;2 ·3193,3962,0;2|
|11736|28 /25|561 ×1 and995 ×3|25|2614,3314,1;0 ·2671,3301,1;1 ·2668,3693,1;3 ·3042,3949,0;0|
|11737|43 /125|995 ×50|75|2671,3299,1;1 ·3040,3949,0;0|

All use shape10, size1×1, closed mesh1249 and **open ID171 /mesh1226**, retaining the placement rotation.171 is an inert `Open chest` with no loot/search action. Success visibly opens it; resource expiry or script disposal restores the original chest. Inventory-full failure grants nothing, does not deplete or open it, and snapshots only occur after successful atomic delivery. Same-world players share depletion. Instances/unreviewed placements are refused.

The [10-coin chest page](https://oldschool.runescape.wiki/w/Chest_(10_coins)) gives11735,13/7.8, ten coins and a7-second reset. The [nature-rune page](https://oldschool.runescape.wiki/w/Chest_(nature_runes)) gives11736,28/25, one nature rune plus three coins,15 seconds, and describes the southwest50-coin/125XP companion chests; those companions are11737 in the raw map. Its level43 and45-second reset come from the [Thieving table](https://oldschool.runescape.wiki/w/Thieving). Individual10/nature pages and overview reset timings disagree; the conservative7/15-second values are intentionally retained (12/25 ticks), not claimed live parity.

Native Open is still the wrong option: it schedules trap damage through an action returning a hitsplat effect. The nature chest's documented `floor(currentHP*0.12)+3` formula is used; applying the same formula to10/50-coin chests is **provisional**. Native trap searches and Pick-lock aliases share the same guaranteed fixed-bundle success path after level/target validation. No name-based loot or speculative weighted tables exist.

Known deferred ordinary chests:11738 blood-rune/Chaos Druid Tower,11739 Ardougne Castle,11740/11741 unresolved/unplaced variants,11742 steel-arrowtip candidate. Blood chest11738 has a documented post-loot magical teleport; it is not enabled merely by supplying blood runes. See [Chaos Druid Tower chest](https://oldschool.runescape.wiki/w/Chest_(Chaos_Druid_Tower)).11742 maps to Hemenster/Rellekka/Mourner locations, but complete reward/failure confirmation was not obtained. Minigame/copy placements of11735–11737 are deliberately not enabled.

## Working doors and direction

All are shape0,1×1. Crossings below are actual collision-tested cardinal edges; no teleport is used. Ordinary routes currently require picking **both ways**, explicitly provisional because OSRS free-exit evidence was unavailable. RS3's Pirates' Hideout free-exit rule was not transferred to OSRS.

|Closed → open visual|Closed `(x,y,plane;rotation)`|Crossed neighbor|Requirement / XP|
|---|---|---|---|
|11719 →1536|2674,3305,0;1|2674,3306|1 /3.8|
|11720 →1536|2674,3304,0;3|2674,3303|16 /15|
|11723 →1536|2565,3356,0;0|2564,3356|46 /37.5|
|11724 →1544|2572,3288,1;3|2572,3287|61 /50|
|11724 →1544|2572,3305,1;1|2572,3306|61 /50|
|11727 →3271|3038,3956,0;0|3037,3956|39 +lockpick /35|
|11727 →3271|3041,3959,0;1|3041,3960|39 +lockpick /35|
|11727 →3271|3044,3956,0;2|3045,3956|39 +lockpick /35|
|11728 →3271|2601,9482,0;3|2601,9481|82 +lockpick /50|
|5501 →5502|3183,9611,0;0|3182,9611|1 /4; inside→outside only|

Classic requirements use the [OSRS Thieving doors table](https://oldschool.runescape.wiki/w/Thieving#Doors);11727 is directly identified by its [Pirates' Hideout door page](https://oldschool.runescape.wiki/w/Door_(Pirates%27_Hideout)). Cache placements support the classic ID/location correlations; older user-maintained wiki notes corroborate11719/11720 but disagree on3.8 versus4XP. The overview3.8 value is used.

**HAM jail integration is ready:** spawn inside on `(3183,9611,0)`; the player can pick west through5501 to `(3182,9611,0)`. The [HAM jail door page](https://oldschool.runescape.wiki/w/Door_(H.A.M._Hideout_Jail)) restricts picking to inside. Raw closed-map flood fill identifies the east side as a24-tile enclosed cell and the west side as a73-tile corridor. This combines gameplay evidence with a geometric inside/outside inference. Picking from the west is rejected. The NPC pickpocket runtime selects jail versus outside-ejection outcomes.

HAM trapdoor behavior remains parent5492, closed5490, open5491, varbit235, level1/4XP, climb destination3149,9652,0. Effective boosted levels and authoritative closed-child/varbit revalidation prevent stale-child XP farming. Failure retry cadence remains5 ticks. Optional lockpick improvement, exact escalating odds and failure XP are not claimed implemented.

## Complete native option disposition

The following groups partition all65 direct native IDs without duplicates. Unknowns receive a generic non-rewarding Pick-lock/Picklock fallback; **no blanket Open override** is registered for unsupported quest/POH objects. Existing exact quest handlers retain precedence.

|IDs|Context / disposition and missing evidence|
|---|---|
|3266,3268|Underground Pass gates: requirement data1/3 and50/3; physical gate behavior/exit rules missing|
|4799,4800|Ape Atoll jail: quest, guards, cell outcomes and routes missing|
|5490|HAM trapdoor implemented through parent5492; odds provisional|
|5501|HAM jail implemented inside-only route; exact odds/failure behavior missing|
|6848,6850,6853,6883|Ogre coffins: lock/open phases, quest/failure and complete loot missing|
|7246|Rogues' Den shortcut:80 Thieving/minigame drain and route not implemented|
|9565|Port Sarim/Black Knights jail:1/4 requirements; per-spawn inside routes, F2P XP and escalating odds missing|
|11719,11720,11723,11724,11727,11728|Implemented9 routes; reverse free-exit policy and exact odds provisional|
|11721,11722|Sewer paired gate leaves:31/25;2655,9715 and2655,9714,plane0,rotation2. No verified full visual pair; not single-door toggles|
|11725|No placement found in successfully decoded maps; no unsupported Ross alias|
|11726|Magic axe hut:23/22.5 +lockpick;3190,3957 and3191,3963,plane0. Custom mesh colors/textures lack verified open pair|
|13314,13317,13320,13323,13326|POH challenge doors: static pairs exist, but owner/challenge/force rules missing|
|13344,13345,13346,13347,13348,13349|Other POH challenge doors: same gameplay gaps plus physical mapping|
|15755,15759|HAM storerooms: quest state and entry/exit handling missing|
|20948|Pyramid Plunder: room level, traps and instance lifecycle missing|
|22681,22682,22697,22698|Dorgesh-Kaan chest variants: average52/200 versus rich78/650 classification, access, loot and reset states not sufficiently verified|
|27771,27772,27773,27774,27775,27776|Stealing artefacts drawers: assignment and artefact ownership required, not generic loot|
|28783|Kruk dungeon: Monkey Madness II keys, routes and poison failures missing|
|34429|Molch stone chest:64/280 known; complete loot weights and failure teleport destinations missing|
|34840|Grubby Door:57/10 requirement data; physical pair/route missing|
|40178|Ardougne/Ross candidate: location2610,3316,0; role/failure/side policy not enabled|
|40739,41760,41931|Modern chests: per-ID activity/quest context, rewards and requirements unresolved|
|46592|Secrets of the North dusty-scroll chest: Mastermind quest puzzle, not generic random loot|
|48766,49614|Newer stone/chest objects: context and puzzle/state rules unresolved;48766 not assumed Molch|
|54365|Gate: context/requirements/routes unresolved|
|54773|Chest: context/requirements/full loot unresolved|
|58096|Cell door: per-spawn quest/jail state and inside/outside rules unresolved|
|60511,60512,60514,60515,60517,60518|Rusty/tarnished/reinforced pirate chests: tier/island variants, full loot and failure mechanics not verified|

The five existing static POH pairs are13314→13315,13317→13318,13320→13321,13323→13324,13326→13327. Their presence in `data/catalogs/server/doors.json` does not establish Thieving gameplay support.

Morph parents found:5492→5490 (varbit235);10084→41760 (12296);15766→15755 (2270);26617/26618→20948 (2366),26619→20948 (2367),26620→20948 (2368),26621→20948 (2369);46899→46592 (14722);49911→49614 (15288);55354→54365 (11165);58095→58096 (18153). All use varbits, not varps. Only HAM parent handling is implemented here.

## Integration and exact APIs

|Source|Responsibility/API|
|---|---|
|`apps/server/src/content/gamemodes/vanilla/skills/thieving/picklockDefinitions.ts`|Object-only requirements, exact rewards, placements/routes, complete option disposition|
|`apps/server/src/content/gamemodes/vanilla/skills/thieving/picklock.ts`|Action registration, revalidation, chest lifecycle and door traversal|
|`apps/server/src/game/skilling/SkillAction.ts`|`defineSkillAction`, `requestSkillAction`, `repeatSkillAction`; cancelable skill-family actions|
|`apps/server/src/game/skilling/Requirements.ts`|`getSkillLevel(services,player,17)` effective level; `checkSkillingRequirements` effective levels and inventory lockpick1523|
|`apps/server/src/game/skilling/InventoryTransform.ts`|`applyInventoryTransform(inventory,player,{inputs:[],outputs})`; shared atomic reward-only support/rollback|
|`apps/server/src/game/skilling/ThievingPolicy.ts`|Shared success helper; object policy explicitly0.50–0.95 provisional, capped after boosts|
|`apps/server/src/game/skilling/ResourceNodeTracker.ts`|`add`, `processExpired`, `drain`; per-registry depletion/passage ownership and cleanup|
|`apps/server/src/game/services/LocationService.ts`|`replaceTemporaryLoc({worldViewId},oldId,newId,tile,plane,{oldShape,newShape,oldRotation,newRotation})`, `clearTemporaryLoc`; chest state/collision/late viewers|
|`apps/server/src/world/DoorStateManager.ts`|New `toggleExplicitSingleDoor({...DoorToggleParams,singleDef:{closed,opened,openDir?}})` mirrors existing explicit-gate API. Reuses collision, tile state and tracking; generic Close honors tracked pair before static single catalog|
|`apps/server/src/pathfinding/PathService.ts`|`findPathSteps({from:{x,y,plane},to,size:1,worldViewId},{maxSteps:1})` plus `canActorStep`; reject clamped/partial/diagonal/non-cardinal results|
|`apps/server/src/game/player.ts`|`setPath(steps,false)`, `peekNextStep`, `clearPath`; actual movement, never a door teleport|
|`apps/server/src/game/scripts/ScriptRegistry.ts`|`registerLocInteraction`, `registerLocAction`, `registerActionHandler`, `registerTickHandler`, `registerCleanup`; ID/action handlers precede generic fallbacks|
|`apps/server/src/game/scripts/ScriptRuntime.ts`|Tile-interaction keys refer to player standing tile; not automatically object tile|
|`apps/server/src/game/interactions/LocInteractionHandler.ts`|Script handlers before generic door processing; proximity alone is not proof of a currently spawned object|
|`packages/custom-content/src/items/cacheLoaderDecorator.ts`|Canonical shared client/server factory; application-owned Loc decorator/menu overrides for11735/36/37|
|`packages/osrs-engine/src/cache/loader/CacheLoaderFactory.ts`|Undecorated census and optional application-owned Loc decorator extension point|
|`apps/server/src/world/CacheEnv.ts`, `LocTileLookupService.ts`|Pinned cache/XTEA loading and raw placement decoding|
|`tools/diagnostics/audit-picklock-objects.ts`|Read-only raw/decorated census, snapshot diff, morph parents, definition dispositions, visual candidates and static placement counts|

Door lifecycle: delayed effective-level/tool/plane/world/origin/alive/action revalidation → exact per-side policy → explicit door service open/collision update → loc/sound broadcast → validated one-tile path → close on arrival, cancellation, timeout or disposal. XP is awarded only after arrival and successful closure. On path exceptions, the passage is closed in `finally`. If another player closes first, cleanup does not reopen it or substitute a generic unlocked ID. Doors/chests are global-world only until a scoped door engine exists.

No `serviceInterfaces.ts` extension is required. Shared door behavior belongs to the explicit-single-door entry point and tracked-pair precedence in `DoorStateManager.ts`. Common Thieving policy, NPC behavior, inventory transactions and menu aliases remain in their respective shared modules; object definitions do not duplicate those systems.

## Validation and remaining limits

`apps/server/tests/object-picklocking.test.ts` passes: exhaustive snapshot census, aliases/native search, boosted and drained levels, rollback/cooldown, target invalidation, dispatched trap effect, HAM state/stale-child/retry, inventory lockpick removal, real door-manager collision changes, arrival/cancel/timeout/disposal/path rejection and external generic Close. A synthetic free-side policy verifies that **both Open and Pick-lock bypass level/tool requirements and retries and grant zero XP**. HP validation and trap scaling read the authoritative `skillSystem.getHitpointsCurrent()`. The legacy `skilling-content-boundaries.test.ts` picklock timing fixture also passes.

`apps/server/tests/thieving-cache-geometry.test.ts` is the opt-in raw-cache regression using the real map/path/door services. It belongs in `test:cache` and is excluded from the default cache-free suite. Shared-open-ID generic closure is also covered by the focused object's real door-manager regression.

Server runtime and tools focused TypeScript checks passed during validation. No live client session was exercised: model selection, loc-change lifecycle and actual raw-map collision were tested programmatically, not asserted from screenshots. Unknown quest/minigame chests, exact probabilities, unverified free exits, arbitrary morph-parent dispatch and unreviewed placements remain explicit gaps. Exact placements, HAM morph state, chest depletion and tracked door state are revalidated; a general query detecting unrelated dynamic removal of a base loc is not provided by this implementation.

Reproduce without pnpm dependency auto-install: `node apps/server/node_modules/tsx/dist/cli.mjs --tsconfig apps/server/tsconfig.tests.json tools/diagnostics/audit-picklock-objects.ts`; use the same runner for the focused object test. For package commands use `pnpm --config.verify-deps-before-run=false ...`.
