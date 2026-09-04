# Thieving framework

Status: implementation foundation with automated coverage; live gameplay verification is still required. Target cache: OSRS revision 237, 2026-03-25 (OpenRS2 cache 2504). Current Wiki facts can postdate that cache; source dates and provisional rules must remain visible.

The [complete NPC catalog assessment](thieving-npc-catalog.md) covers 15,612 raw NPC records: 475 direct Pickpocket definitions and 57 relevant morph parents (531 distinct IDs, because one parent also exposes the action). All are classified; 427 direct definitions are enabled and 48 require quest/activity-specific or unresolved behavior. The checked-in named snapshot contains 474; the raw cache additionally reveals unnamed Fenkenstrain parent 1955. The report records exact IDs, loot tables, sources, evidence levels and a reproducible audit command.

## Owners and authoring

- NPC content: `apps/server/src/content/gamemodes/vanilla/skills/thieving/pickpocketDefinitions.ts`.
- NPC execution: `createPickpocketRuntime` in the adjacent `pickpocket.ts`.
- Object content and execution: adjacent `picklockDefinitions.ts` and `picklock.ts`.
- Shared skill math and rewards: `apps/server/src/game/skilling/ThievingPolicy.ts`, `Requirements.ts`, `SkillAction.ts`, and `InventoryTransform.ts`.
- Client/server menu additions: `packages/custom-content/src/locs/ThievingLocTypeLoader.ts`, through the canonical custom cache factory. Raw cache definitions are left intact.

The vanilla skills registration calls the Thieving registration, which installs one NPC action family and one object action family. A new ordinary pickpocket target supplies reviewed IDs, required level, XP, chance endpoints, loot, and failure policy. It does not register another execution loop. An absent static import is not evidence that a content provider is unused.

NPC action payloads contain target identity and attempt identity. Reward tables and requirements stay in the server-owned definition. Before starting and before committing a delayed result, the runtime checks the live NPC reference, type, hitpoints, visibility/world, plane, adjacency, player health, and relevant combat/lock state. Effective Thieving (base plus boosts or drains) is checked again at resolution. Duplicate or stale phases cannot award twice, and different players can pickpocket the same NPC independently.

Active NPC morphs are resolved through the player's varbits/varps on each phase; a parent never inherits a reward table merely from its name. Required quests use the existing quest registry and completion check. The Fremennik requirement, for example, uses the registered `fremennik_trials` definition rather than another quest-state store.

The attempt owns its temporary lock and facing cleanup. Failed enqueue, exceptions, removed/replaced targets, logout and provider unload release it. A tick deadline releases cancelled or modal-deferred continuations. Cleanup does not overwrite a different lock state. Ordinary pickpocketing is one attempt per click; automatic blackjacking and distraction activities are separate content.

## Success, loot, and consequences

Reviewed NPC success endpoints use the [Wiki's current skilling interpolation](https://oldschool.runescape.wiki/w/Template:Skilling_success_chart). The combined interpolation is rounded with `floor(value + 0.5)`, then one is added and the result divided by 256. Gloves of silence apply an integer-truncated 5% increase to each endpoint before interpolation, subject to their Hunter requirement. The old code divided by 255 and treated gloves as a reduction in failure probability.

Where a target lacks verified endpoints, its explicit evidence record identifies the provisional fallback curve. The player's boosted level is passed through even above 99, as requested; whether authentic OSRS's Thieving caller caps the value remains unverified. Diary/cape stacking, glove degradation, dodgy necklaces and Shadow Veil need dedicated integration; existing equipment alone must not be claimed as complete coverage.

Loot distinguishes a guaranteed bundle from one weighted roll. They are converted into one atomic inventory reward; late insertion failure restores all slots and awards no XP. Currency becomes the target's actual coin-pouch variant where applicable. Tokkul is a direct currency reward, not a coin pouch. Opening pouches is also atomic. The baseline pouch cap remains 28; diary-expanded caps are not yet connected.

Failure policies support damage/stun, combat or nearby guard response, and relocation with an optional shared repeated-detection counter. A mechanism being supported does not prove it applies to every NPC. For example, [TzHaar-Hur](https://oldschool.runescape.wiki/w/TzHaar-Hur) combat assistance is documented, but evidence does not justify assigning that assistance to failed pickpockets. TzHaar heat damage on successful theft is prevented by ice gloves.

[H.A.M. members](https://oldschool.runescape.wiki/w/H.A.M._Member#Getting_thrown_out) share a three-concussion counter and use the Wiki's estimated Agility avoidance curve. The initial content policy ejects outside the hideout. Its destination/reset-area assumptions are recorded in the catalog. The exact jail split and clothing mitigation remain unresolved; they must not be described as verified. Leaving the configured area, logout, and provider unload clear the counter.

Individual tables carry evidence independently for requirements, chance, loot, and failures. The existence of a main loot table does not establish tertiary clues/pets, quest overrides, Farming-dependent seed rates, or location-dependent rare rolls. Quest-specific theft and activities with unresolved ownership rules have explicit catalog entries and explanatory unavailable responses, rather than arbitrary ordinary loot.

## Chests and doors

The [complete object assessment](object-picklocking-audit.md) classifies all 65 native picklock definitions, 12 morph parents, and eight separate trap-search chest types. It includes exact placements, directional evidence, enabled content, and the missing requirements for each deferred group.

Pick-lock spellings share the object action family, and native trap-search options remain available. Supported chest aliases are added only to reviewed cache IDs, in a free action slot; no existing option is overwritten. Requirements use effective levels and tools are rechecked during delayed attempts.

Chests commit their complete loot before XP and depletion. Depletion keys include object identity, tile, plane and world view. Door content separates the level/tool requirement from per-location side rules. Sides can require picking, allow a free exit, or prohibit passage. Missing inside/outside evidence must not silently grant a free exit.

The initial playable set contains three fixed-loot chest types (10 coins, nature rune plus coins, and 50 coins) across 14 reviewed placements. Their opened appearance uses reviewed cache object 171, not a claimed original OSRS transform. Ten single-door placements are enabled: eight around Ardougne and the Wilderness plus the Yanille dungeon door and H.A.M. jail exit. The jail can only be picked from inside; the other nine routes provisionally require picking in both directions. The framework supports a free side, but no unsourced free-exit rule is enabled. Paired gates and quest/activity objects remain separately assessed.

Door passage uses the existing door manager for geometry/collision and the existing path service for a cardinal step through the opened edge. XP follows a completed passage. Passage cleanup closes the door after arrival or an interrupted traversal. Instanced doors require an instance-scoped door implementation before enabling global collision changes there.

## Validation and next live pass

Focused tests cover effective levels and drains, stale/replayed actions, target replacement/removal, inventory rollback, failure consequences, lifecycle cleanup, object requirements, side policy, and menu alias preservation. The maintained NPC audit compares the definitions against raw cache options, including morph parents, and reports missing/invalid assignments separately from explicitly unavailable cases.

Cache-independent verification on 2026-09-04 passed the repository checks, all runtime/test type checks, one tools test file, 180 server test files, and 37 client test files. The NPC runtime suite includes 64 focused cases. A test-only optional-effects TypeScript error found by the first complete run was corrected before the successful verification pass.

The production server/client builds and client artifact budget check also passed (916,732 gzip bytes, below the 1,048,576-byte budget). The overall `check` command is **not fully green**: its final VitePress build is blocked by two pre-existing out-of-site links in the untracked `project-handoff-2026-09-04.md` (`../server/src/game/encounters/README.md` and `../server/src/game/encounters/mechanics/boss-mechanic-coverage.md`). That user-owned handoff was left unchanged. A new catalog link initially exposed the same publishing limitation; it was fixed with the `thieving-npc-catalog.md` include page, and the docs-only rerun confirmed only the two handoff links remain. Repository filesystem-link validation passes.

`pnpm --config.verify-deps-before-run=false run test:cache` passed on 2026-09-04 against revision 237: three server test files and one client test file. The maintained `thieving-cache-geometry.test.ts` uses raw map collision (not a precomputed substitute) to verify all ten door placements, both approach directions, exact one-step paths, and restoration of the original ID, tile, rotation and collision. It is excluded from cache-independent tests and never downloads its own data. The pnpm flag avoids the local pnpm 11 dependency-verification install attempt; it does not skip the tests.

For live verification, try low and boosted levels on an ordinary civilian, farmer, guard, knight, a multi-item target, and H.A.M. members. Fill the inventory between start and resolution, open pouches with a full inventory, have two players use one NPC, relog, and interrupt/reset content. Check animation timing, stun duration and damage presentation independently of numeric tests.

For each enabled chest, verify visible opening, exact reward bundle, depletion and restoration, full-inventory failure, and two-player contention. For each door, verify both approach directions, missing lockpick, failed attempts, walking through, closure, interrupted traversal and provider cleanup. Record observed results using the [manual testing policy](contributing/testing.md); automated coverage is not a live-parity claim.
