# Naming standard

Every governed path under **apps/**, **packages/**, **tools/**, and **data/** follows
this standard. `pnpm run check:naming` enforces the mechanically decidable rules;
contract-name exceptions must be explicit and narrowly owned.

## Paths and artifacts

- Use lowercase ASCII **kebab-case** for repository and domain directories.
- Do not create generic **common**, **shared**, **utils**, **helpers**, **misc**,
  **temp**, **old**, **new**, or **final** buckets. Name the domain and responsibility.
- Use a suffix that states the artifact's role. Do not rely on its folder alone.
- TypeScript behavior tests end in **.test.ts**.
- Use singular names for one definition and plural names for collections.
- Avoid **misc**, **common**, **shared**, **utils**, **helpers**, **new**, **old**,
  **final**, **temp**, and numbered copies. Name the domain and responsibility.
- Reserve **index.ts** for a deliberate public package boundary, not hidden behavior.
- Standard ecosystem files such as **README.md**, **LICENSE**, **CODEOWNERS**, and
  tool-required configuration names are exceptions.
- Preserve exact external protocol names, cache names, and persistent IDs when changing
  them would change a contract.

| Artifact | Pattern | Example |
| --- | --- | --- |
| Class, component, enum, or primary type owner | **PascalCase.ts(x)** | **CombatStateStore.ts**, **BossHealthBar.tsx** |
| Functional TypeScript module | **lowerCamelCase.ts** | **resolveNpcAnimation.ts** |
| Automated test | **behavior.test.ts** | **dragon-claws.test.ts** |
| Test fixture | **scenario.fixture.json** | **full-inventory.fixture.json** |
| Tool command or support module | **kebab-case.ts** | **generate-npc-sounds.ts** |
| Canonical collection | **plural-domain.json** | **npc-spawns.json** |
| Schema | **dataset.schema.json** | **npc-spawns.schema.json** |
| Provenance companion | **dataset.meta.json** | **npc-spawns.meta.json** |
| Stable regenerated report | **topic.md** | **npc-animation-batches.md** |
| Historical report | **topic-yyyy-mm-dd.md** | **cache-audit-2026-08-29.md** |
| Data migration | **yyyymmddhhmm-scope-action.ts** | **202608291430-player-state-v2.ts** |
| Manual test record | **feature.md** | **special-attacks.md** |

Target workspace packages use their directory name:

- **@august/game-model**
- **@august/protocol**
- **@august/osrs-engine**
- **@august/custom-content**

All first-party package specifiers use the **@august/** namespace. Put reusable code in
its owning package; use an app-local alias only for private application source.

Dot-separated lowercase role qualifiers are allowed when they distinguish build or
data roles, for example **league-tasks.data.ts**, **Gzip.web.ts**, and
**npc-sounds.overrides.json**. They do not replace a meaningful base name.

## Code identifiers

| Kind | Rule | Example |
| --- | --- | --- |
| Type, class, enum, component | PascalCase | **NpcCombatDefinition** |
| Function, method, variable | camelCase | **resolveNpcAnimation** |
| Boolean | leading is/has/can/should | **hasSpecialEnergy** |
| Constant and environment key | UPPER_SNAKE_CASE | **AUGUST_WORLD_ID** |
| Private field | camelCase; no decorative prefix | **pendingHit** |
| Persistence or protocol key | preserve the declared contract | **leagues-v** |

Treat an acronym as a word: **npc-animation** in paths, **NpcAnimation** in PascalCase,
and **resolveNpcAnimation** in lowerCamelCase. Do not introduce competing forms such as
**NPCAnimation** or **Npcanimation**.

## Contract-name exemptions

Persisted and wire-facing names keep their declared spelling even when it differs from
the repository style. This includes gamemode IDs, save/database keys, protocol IDs and
opcodes, cache symbols, external schema tags, licensed third-party asset filenames, and
tool-required ecosystem filenames. Document the contract and its owner at the
definition or in the nearest README. Renaming one requires an explicit compatibility or
data migration; a style-only refactor is not sufficient.

## Branches and commits

New branch names use **type/kebab-case-summary**, where type is **feat**, **fix**,
**refactor**, **docs**, **test**, or **chore**. Automated Codex branches may use the
required **codex/** prefix. Existing branches are grandfathered.

Commit subjects use an imperative verb and one concern, for example
“Move NPC review notes into manual testing”. A commit called “cleanup” must be split or
renamed to state what changed.

## Safe renames

1. Search for import paths, string-based loaders, scripts, documentation, deployment
   paths, and persisted names—not only static TypeScript imports.
2. On a case-insensitive filesystem, use a temporary intermediate name so Git records
   a case-only rename.
3. Update all consumers and validation in the same change.
4. Never rename game-mode IDs, save keys, protocol opcodes, or external cache symbols
   for aesthetics. Use a reviewed migration or compatibility adapter.
5. Mark a retained alias with its final target, owner, and removal condition.
