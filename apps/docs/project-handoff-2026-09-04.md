# August project handoff — 2026-09-04

This is the carryover document for continuing development in a new Codex chat. It is a
navigation and decision record, not a replacement for the repository's authoritative
architecture, framework, or parity documentation.

## Start the next chat here

Before changing code:

1. Read this document completely.
2. Run `git status --short`, `git branch --show-current`, and `git log -5 --oneline`.
3. Read the documentation linked under **Authoritative references** for the subsystem being
   changed.
4. Search the live registration path as well as the implementation. August loads gamemodes,
   content modules, scripts, cache identifiers, and data by convention, so an absent static
   import does not prove that code is unused.
5. Preserve unrelated work in a dirty tree and use focused tests before the complete release
   gate.

Repository state when this handoff was written:

- Branch: `Project-Overhaul`
- Baseline commit: `8e18d7c6` (`Combat selection choice fix`)
- Package manager: pnpm 11.19.0; do not use Yarn
- Runtime: Node.js 22.16 or newer
- Remote: `NotAnIronman/August`

The handoff document itself is the only expected change after that baseline unless the user has
made further edits.

## Product direction

August is an OSRS-parity TypeScript game with a browser client, authoritative tick-based server,
shared packages, content modules, tools, generated data, and documentation in one pnpm workspace.

The user's standard is:

- Organization must make ownership and purpose obvious.
- Naming must be predictable and consistent.
- Repeated behavior must have one reusable implementation.
- Temporary experiments must be identifiable and removable.
- Bosses, skills, UI, and content must be modular enough that new content is primarily data and
  small encounter-specific choreography—not another parallel engine.
- Match authentic OSRS behavior wherever authoritative information exists. Do not invent parity
  claims when cache data, animations, IDs, formulas, or mechanics are uncertain.
- Keep the game responsive. Client input, rendering, rAF/FPS, server ticks, and lifecycle cleanup
  are product features, not afterthoughts.

The user works iteratively: implement a coherent slice, let them test it live, incorporate exact
feedback, and then continue. Concrete behavior and visible results matter more than theoretical
completeness.

## Authoritative references

Use these instead of reconstructing architecture from chat history:

- [Repository overview](overview.md)
- [Project map](project-map.md)
- [Architecture](architecture.md)
- [Repository naming](contributing/naming.md)
- [Testing](contributing/testing.md)
- [Repository audit](refactor-audit.md)
- [Cleanup roadmap](cleanup-roadmap.md)
- [OSRS parity checklist](osrs-parity-checklist.md)
- [Boss and skilling integration matrix](boss-skilling-integration-matrix.md)
- [Skilling framework](skilling-framework.md)
- [Encounter framework](../server/src/game/encounters/README.md)
- [Boss mechanic coverage](../server/src/game/encounters/mechanics/boss-mechanic-coverage.md)
- [Hosting guide](hosting.md)

If this handoff conflicts with current code or a newer focused document, inspect the registration
and tests and treat the newer evidence as authoritative.

## Major work completed in this development run

### Repository and runtime overhaul

- Migrated August into a structured pnpm monorepo with explicit ownership across `apps`,
  `packages`, `tools`, and `data`.
- Added enforceable structure, naming, dependency-boundary, generated-data, documentation, test,
  build-artifact, and bundle-size checks.
- Consolidated mutable runtime state under ignored server-owned locations. Cache directories,
  SQLite databases, logs, locks, and temporary output must remain outside Git.
- Reworked lifecycle ownership for scripts, hot reload, scheduled work, browser startup/shutdown,
  rendering, workers, network subscriptions, and instances.
- Rewrote the public Git history into a clean baseline earlier in the project. An old checkout that
  reports unrelated histories should normally be re-cloned rather than force-merging two histories.
- The user reported materially higher FPS/rAF and lower JavaScript frame time after the overhaul.

### Reusable encounter framework

The current authoring surface is `defineBoss`, `attack.*`, `phase.atHealth`,
`defineBossMechanics`, `mechanic.*`, `registerOwnedEncounter`, and `defineBossRoom`.

Reusable mechanics include:

- weighted and conditional melee/ranged/magic attacks;
- phases, hard health gates, thresholds, deterministic encounter RNG, and attack cadence;
- delayed impacts and projectiles;
- visible floor hazards with target/random placement, quantity, damage, delay, tell, and effects;
- adds, aggression, formations, expiry, and encounter ownership;
- interruptible healing and enrage timers;
- invulnerability, shields, and damage caps;
- stat drain, prayer drain, poison/venom, freeze, stun, and knockback;
- equipment gates, target selection, multi-target sequences, and owned timelines;
- instance creation/join/leave, exits, graves, population, cleanup, and GWD altars;
- boss HUD snapshots, killcount metadata, and collection-log integration boundaries.

Encounter reset, death, disposal, provider unload, logout, and respawn must cancel or rebuild every
owned mechanic resource. Do not schedule raw work outside runtime ownership without an explicit
cleanup path.

The live framework adopters include all four original GWD bosses and guards, Nex and mages,
Barrows, Scurrius, all three Moons of Peril, Araxxor and its adds, Giant Mole, Dagannoth Kings, and
Zulrah. Fight-specific choreography intentionally remains local when it is not truly reusable.

### Boss content built or substantially expanded

- God Wars Dungeon: Graardor, K'ril, Zilyana, Kree'arra, entrances, traversal requirements,
  altars, graves, bodyguards, killcounts, collection log, Frozen Door, key pieces, and related
  smithing/item conversions.
- Nex: Ancient Prison access, bank area, instance plumbing, Nex/mage spawning, hard phase gates,
  drops and item creation. Later phase attack pools and full special-attack parity remain explicitly
  incomplete; see the encounter coverage document.
- Barrows: sarcophagi, one-run brother state, crypt selection, chest choices, rewards, loot display,
  collection log, chest count, stair routing, and brother effects.
- Scurrius: instance, style selection, delayed projectiles, food movement/healing, rats, rockfall
  hazards, cheese rewards, drops, killcount, and collection log.
- Moons of Peril: circular run order, statues, instances, chest choices/rewards, glyph cycle,
  positioning rules, Eclipse clone sequence, Blood jaguars/healing, Blue storm lanes/braziers,
  supplies, moths, bream, Moonlight potions, escape behavior, and no-duplicate reward policy.
- Araxxor: instance and Slayer gate, attacks, venom/stat effects, eggs and araxytes, acid hazards,
  mirrorback/ruptura/acidic behavior, enrage, corpse interaction, sacrifice/search reward flow,
  and boss HUD integration.

Do not interpret this list as proof of perfect live parity. The framework and content are present,
but animation/cache presentation and multi-kill reset behavior should be retested whenever their
owner changes.

### Boss health HUD

August now has a dedicated boss health display independent of fragile cache-interface layouts. It
supports:

- boss name;
- exact current/maximum health;
- percentage health;
- green-to-red health fill;
- labeled mechanic/phase notches;
- a compact rectangular Old School presentation and the modern presentation;
- plugin settings for style and visibility.

The modern style was reduced to roughly 75% of its original size and decorative nonfunctional
handles were removed. The user confirmed the result visually. Use `::bosshud demo`,
`::bosshud <current> [maximum] [name]`, and `::bosshud hide` for manual inspection.

### Reusable skilling framework

The shared skilling layer owns requirements, effective/base levels, carried/equipped tools,
timing, interruption, batching, atomic inventory transforms, stochastic outcomes, gathering
success, depletion, respawn, and resource-node lifecycle.

Substantial content exists for:

- Woodcutting, including authentic chance calculations, broad tree coverage, clue boxes,
  guild boost, axe specials, and felling axes;
- Firemaking, including log lighting and Forester's campfires/bonfires;
- Fletching, including shortbows, longbows, arrow shafts, product selection, and batch quantities;
- Mining, including normal ores, gem rocks, sandstone, granite, weighted variants, depletion, and
  respawn;
- Smithing and smelting, including furnace/anvil recipes and atomic exchanges;
- Crafting, including gems, jewellery, leather/hides, silver, glass, spinning, and sinew;
- production and gathering foundations used by Cooking, Fishing, Herblore, Runecrafting,
  Thieving, Prayer, Agility, and Sailing content.

Use `defineGatheringSkill`, `defineProductionSkill`, `defineSkillAction`,
`requestSkillAction`, `repeatSkillAction`, `checkSkillingRequirements`, and
`applyInventoryTransform`. Never hand-roll another remove-then-add recipe: transforms must be
atomic and restore the complete inventory on failure.

Known broad parity gaps still needing dedicated investigation include Farming, Hunter,
Construction, and a complete Slayer task system. The current parity checklist distinguishes
`TESTED`, `CODE`, and `UNKNOWN`; preserve those evidence levels.

### Client, UI, banking, plugins, and developer tools

- Banking was made responsive, ordered, tab-aware, safe for item options, and expanded to 2,000
  slots. Banker interaction works through counters and the corrected appearance viewer is reused.
- Inventory item `Use` now arms one source item, resolves one item/object/NPC target, and clears at
  the correct time. Floating context menus no longer click through or consume the selection on the
  same click.
- Right-click menus no longer suppress text input or create the prior intermittent input behavior.
- Player and NPC attack-option settings now support all four OSRS policies and persist through the
  varp system. The most recent fix connects ordinary non-draggable primary clicks to the same
  settings action path used by context-menu actions, after cache CS2 runs.
- Ground Items, loot filters, and loot beams were overhauled toward RuneLite-style behavior.
- Developer object transport (`::to`) and dig-rule systems have UIKit editors, short rule IDs,
  editing/deletion, animation/message/item requirements, and transition-area prefetching.
- Model/NPC/GFX inspection tools were expanded to help find cache models and animations without
  repeatedly spawning content into the live world.
- A loot-reward interface presents a 4x3 visual inventory while rewards remain in the real player
  inventory; Barrows and other reward systems can reuse it.
- A private hosting dashboard reports connection information and connected players. The server can
  host the built browser client from port 43594; public production hosting should terminate TLS and
  use WSS through a reverse proxy.

### Data and test accounts

- A test-bank SQLite transfer was used to build a broad developer item bank. Treat all account
  databases as mutable ignored state, not source assets.
- Never commit `.env`, SQLite databases or sidecars, cache trees, logs, lock files, or local test
  banks.
- The clue policy established during Woodcutting work is a maximum of 15 clues of each tier across
  inventory and bank, awarded as tier-appropriate clue boxes. Full clue completion/reward content
  is not implied.

## Latest completed fix: combat control settings

Commit `8e18d7c6` fixes Player `Attack` options and NPC `Attack` options snapping back to
`Depends on combat levels`.

Root cause: ordinary left-clicks on non-draggable settings widgets execute through
`widgetClickInput.ts` and did not pass through `WidgetActionRouter`, where the dropdown owner and
selected varp were tracked. The cache script redrew from unchanged value zero.

Resolution:

- observe the row/dropdown before cache CS2 mutates or removes the dynamic widget;
- run the cache handler exactly once;
- commit the selected player or NPC varp afterward;
- let the existing transmit-varp hook persist it server-side;
- suppress the duplicate generic packet for the transient dropdown child.

Focused validation completed:

- production client TypeScript graph;
- client test TypeScript graph;
- `attack-option-settings.test.ts`;
- `widget-context-menu-input.test.ts`;
- `git diff --check`.

The next live smoke test should change all four modes for both Player and NPC options, close/reopen
the controls, relog, and confirm menu prioritization follows the chosen policy.

## Known gaps and cautions

- Full Nex phase specials, Giant Mole burrowing, and complete Zulrah form/cloud/snakeling
  choreography are not claimed complete.
- Moons-specific bream/potion/moth integration contains encounter-owned behavior that the generic
  skilling migration deliberately deferred. Characterize the full teardown/repeat flow before
  moving it.
- The client still uses Create React App/react-scripts 5. A build-tool migration requires measured
  behavior and bundle comparisons, not dependency overrides.
- The production browser bundle remains large even though it is below the enforced gzip ceiling.
- Multi-process login and trade ownership are not safe against two server processes sharing the
  same gamemode database without a database-backed lease.
- Public TLS/WSS remains an operator/reverse-proxy responsibility.
- Cache morphs, NPC animations, object options, and model IDs are frequently presentation data,
  not ordinary TypeScript defects. Use the developer viewers and inspect morph/varbit behavior
  before adding hard-coded replacements.
- `apps/docs/osrs-parity-checklist.md` is a living audit and may lag newer focused framework docs.
  Update evidence labels rather than turning `CODE` or `UNKNOWN` into unsupported `TESTED` claims.

## Development and validation workflow

Install and run:

```bash
pnpm run setup
pnpm run prepare:data
pnpm run start
```

Useful narrower commands:

```bash
pnpm --filter @august/client typecheck
pnpm --filter @august/server typecheck:all
pnpm --filter @august/client test
pnpm --filter @august/server test
pnpm run check:repository
```

Final release gate:

```bash
pnpm run check
```

Cache-dependent tests require prepared data and are intentionally separate:

```bash
pnpm run test:cache
```

For gameplay work, automated checks are necessary but not sufficient. Also boot the affected world,
log in, exercise normal and failure paths, repeat the encounter/action across respawns or batches,
relog inside relevant areas, and verify cleanup after escape, death, logout, and provider reload.

## Rules for future changes

- Put browser presentation/input in `apps/client/src`, authoritative behavior in
  `apps/server/src`, reusable domain/protocol/engine contracts in `packages`, maintenance in
  `tools`, and reviewed/generated data in `data`.
- Reuse the encounter and skilling primitives before creating new infrastructure.
- Keep truly unique choreography local, but attach its tasks, NPCs, objects, hazards, and UI to an
  explicit lifecycle owner.
- Use encounter RNG for encounter randomization so each spawn/life has a fresh deterministic
  lifecycle and cannot retain a farmable “good seed.”
- Preserve exact game-mode IDs, save keys, protocol identifiers, and database schemas unless a
  migration is part of the change.
- Use `apply_patch` for source edits, `rg` for discovery, and focused tests proportional to risk.
- Do not delete or reset unrelated user changes. Never use destructive Git recovery to solve an
  ordinary merge or lock problem.
- Do not broaden interactions solely by object name until collision, option, coordinate, and cache
  behavior are understood; accidental global handlers are costly in a full game world.
- Do not claim full parity from the existence of a module. Trace registration, lifecycle, data,
  failure behavior, and live presentation.

## Suggested prompt for the next chat

Copy this into the first message of the next chat:

> We are continuing development of August. Read
> `apps/docs/project-handoff-2026-09-04.md` completely, then inspect the current branch, status,
> recent commits, and the authoritative documentation linked from that handoff. Do not rebuild
> encounter, skilling, lifecycle, UI, or inventory systems that already exist. Preserve all user
> changes, use pnpm, implement through the established modular boundaries, run focused validation,
> and clearly distinguish code coverage from live-tested OSRS parity. After orienting yourself,
> summarize the current state in a short paragraph and continue with my next requested feature.

That prompt plus this document should be enough to resume without replaying the prior chat.
