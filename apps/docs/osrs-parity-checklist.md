# August → OSRS feature parity checklist

Living document. Goal: full-game parity, nothing left unturned. Copy into
Notion and maintain there — update this file too when it drifts, so a future
session (me or your team) has the same ground truth to work from.

## Methodology — how a status was assigned

Every line below got its status one of three ways. The tag in `[brackets]`
tells you which, so you know how much to trust it:

- **`[TESTED]`** — we did this in-game this session and watched it work via
  server logs or a screenshot. Highest confidence.
- **`[CODE]`** — I found real, wired-in implementation code (not a stub, not
  dead code — traced to an actual call site) but did not personally watch it
  run. Should work; worth a quick spot-check, not a rebuild.
- **`[UNKNOWN]`** — I could not find clear evidence either way in the time
  available. Not necessarily broken or missing — just unverified. These are
  the highest-priority items to triage first, precisely because we don't
  know what we don't know here.

Anything not listed at all means I didn't check it this pass, not that it's
confirmed absent — this document will grow as we go, not shrink.

---

## Core Engine & Netcode

- [TESTED] Tick loop, WebSocket server, login/auth, multi-world hosting
- [TESTED] Widget system (open/close/sub-interfaces, dynamic content)
- [TESTED] Camera controls (arrow keys + middle-mouse drag, now with
  direction preference toggle)
- [FIXED THIS SESSION] Legacy/new dual binary protocol — found and fixed a
  real opcode-collision bug (opcodes 9/10/13/32 silently dropped). Full
  protocol consolidation (one system instead of two) is still open — see
  [cleanup roadmap](cleanup-roadmap.md).
- [TESTED] Chat channels (Game/Public/Private/Clan/Trade), chat commands +
  permission system (player/moderator/admin/developer)
- [CODE] Friends list, ignore list (`FriendsChatService`, `social_friends`/
  `social_ignores` tables) — not personally tested this session
- [TESTED] Friends chat channels (service confirmed initialized + tested via
  `friends-chat.test.ts`, which passes)
- [CODE] Trading (`TradeManager`, 1504 lines, escrow/refund tables in
  SQLite) — substantial, real-looking implementation, not personally tested

## Character & Account

- [TESTED] Account creation/login, developer rank via env var, persisted
  rank via `AccountStore`
- [CODE] Appearance customization (`AppearanceService`,
  `PlayerAppearanceManager`) — not tested this session
- [CODE] Bank (`apps/server/src/content/gamemodes/vanilla/banking/`) — not tested this session
- [TESTED] Inventory (`::clear` command exercised it directly)
- [CODE] Equipment (`apps/server/src/content/gamemodes/vanilla/equipment/`,
  `EquipmentStatsUiService`) — not tested this session

## Skills

Confirmed present as real implementation folders under
`apps/server/src/content/gamemodes/vanilla/skills/`:

- [CODE] Agility, Crafting, Firemaking, Fishing, Fletching, Herblore,
  Mining, Prayer (training), Runecrafting, Smithing, Thieving, Woodcutting,
  Cooking (lives under `skills/production/cooking.ts`), Sailing (custom
  skill for this server's sailing content)
- [UNKNOWN] **Farming** — no dedicated folder or files found this pass.
  Needs a real search, not assumed absent.
- [UNKNOWN] **Hunter** — same, nothing found this pass.
- [UNKNOWN] **Construction** — only found `scripts/content/pohPools.ts`
  (looks like POH teleport pools, not a full build-a-room system). Likely
  minimal/absent — needs confirming, this is a big skill to be missing.
- [UNKNOWN] **Slayer** (the actual skill/task-assignment system, distinct
  from slayer master NPCs having dialogue, which does exist) — no dedicated
  task-assignment code found this pass.
- [UNKNOWN] Combat skills (Attack/Strength/Defence/Ranged/Magic/Hitpoints)
  as XP-granting skills — combat itself clearly works (drops, damage, death
  all functioning), but I didn't specifically verify XP gain this session.

## Combat

- [TESTED] Melee combat, NPC death, drop rolls (fixed this session — see
  `references/monsters-complete.json`)
- [CODE] Ranged and Magic combat (`RangedMaxHit.ts`, `SpellCastingService`,
  `SpellXpData.ts`) — real implementation, not personally tested
- [CODE] Special attacks — real, substantial system
  (`SpecialAttackRegistry.ts` + individual spec files: dragon dagger,
  abyssal dagger/bludgeon, dorgeshuun crossbow, bone dagger, dawnbringer,
  and more)
- [CODE] Prayer (combat prayers, protection prayers) — folder exists under
  both `skills/prayer/` (training) and `combat/` (effects)
- [CODE] Boss mechanics (`BossCombatScript.ts`) — generic framework exists,
  coverage of which specific bosses unverified
- [UNKNOWN] PvP / Wilderness combat specifically (vs. PvE) — wilderness
  *access* code exists (`wildernessAccess.ts`, wilderness area scripts),
  but player-vs-player combat rules unverified

## NPCs & Examine

- [TESTED] NPC spawning (24,149 NPCs confirmed spawning at boot)
- [TESTED] NPC examine — 91% real wiki-sourced text, rest via honest
  placeholder (`(It's a/an <Name>!)`)
- [TESTED] Loc/scenery examine — 51% real wiki-sourced text, same
  placeholder fallback for the rest
- [TESTED] Item examine — effectively 100% (cache-native, worked from day
  one)
- [TESTED] NPC dialogue via developer override system (`::setdialogue`,
  full tree runner with branching options)
- [CODE] Default/scripted NPC dialogue (`npcs/dialogue.ts`,
  `npcs/shopTalk.ts`) — real per-NPC dialogue scripts exist, not
  individually verified
- [CODE] NPC aggression (`npc-aggression.json`, 3000 flags loaded at boot)
- [CODE] NPC sounds (`NpcSoundLookup`, 10,180 sound pairs loaded at boot)
- [OPEN] Chathead rendering — root cause found (`modelZoom` reading as 0)
  and mitigated with a safe fallback, but not fully root-caused or visually
  confirmed fixed. Needs a fresh look.

## Items & Economy

- [TESTED] Item drops from NPCs (this session's big win)
- [CODE] Shops (`apps/server/src/content/gamemodes/vanilla/shops/`,
  `data/generated/server/shops.json`) — not tested
- [UNKNOWN] **Grand Exchange** — no GE-specific implementation found this
  pass (searched for exchange/grandexchange-named files, found none). This
  is a major OSRS economy feature — needs a real, dedicated search before
  concluding it's absent.
- [UNKNOWN] Clue scrolls — no clue-scroll-specific system found this pass
  (note: `monsters-complete.json`'s drop data does reference clue scroll
  drops in some tables, e.g. Imp's manual override — but the actual
  casket-opening/reward system wasn't located)

## Quests

- [CODE] 57 quest definition files present, 64 quests registered at boot
  (`[quests] Registered 64 quest(s)` — some definitions likely cover
  multiple quest variants). Quest journal widget exists
  (`questJournalWidgets.ts`, `questListData.ts`). Not personally tested for
  completion/progression this session.

## World Content

- [CODE] Achievement diaries (`diaryJournalWidgets.ts`,
  `apps/server/src/content/gamemodes/vanilla/data/loginVarbits.ts`) — not tested
- [CODE] Sailing (a real, substantial custom system — `SailingInstance`,
  docked collision, deck flooding — confirmed initializing correctly in
  logs when tested this session for an unrelated dialogue test, but not
  deliberately tested end-to-end)
- [CODE] Instanced areas (`instancedAreaManager`) — not tested
- [CODE] Doors/gates (123 single doors, 15 gate sets, 8 double door sets
  loaded at boot, collision-integrated) — not deliberately tested, but
  present in every boot log without errors
- [CODE] Wilderness (access control + area scripts exist) — combat rules
  within it unverified

## Alternate Gamemode (Leagues V / "Raging Echoes")

- [CODE] Full separate gamemode boots cleanly (`leagues-v`), league task
  index built (375/1839 tasks parsed — **worth investigating why only 20%
  parse successfully**, that's a real gap), league widgets registered

## Audio

- [CODE] Music system (`MusicRegionService` — 1,179 regions/692 tracks
  loaded; `MusicSystem.ts`, 1,610 lines) — not tested
- [CODE] Sound effects (`SoundEffectSystem.ts`, `SoundService`) — not
  tested

## Collection Log

- [CODE] Collection log service, 1,697 trackable items loaded across 5
  tabs at boot — not tested

## Developer Tooling (built this session)

- [TESTED] Rank/permission system, `::promote`/`::demote`
- [TESTED] `::help`/`::commands` (rank-aware command listing)
- [TESTED] Dialogue override system + tree runner (`::setdialogue`,
  `::cleardialogue`, `::editdialogue`)
- [OPEN] The actual in-game line-by-line dialogue **editor UI** you asked
  for early on — backend is done, UI was never built. Still on the table.
- [TESTED] Static examine data pipeline (`items.json`/`npcs.json`/
  `locs.json` + wiki import/scrape scripts)
- [TESTED] Drop table data pipeline (`monsters-complete.json`)

---

## Suggested next-priority order

Given what's `[UNKNOWN]` above, roughly in order of "how big a gap would
this be if actually missing":

1. **Grand Exchange** — if genuinely absent, this is probably the single
   biggest missing economy feature in the game.
2. **Farming, Hunter, Construction, Slayer** — four full skills unverified;
   even partial support matters a lot for "feels like the real game."
3. **League task parsing (375/1839, 20%)** — a concrete, measurable gap in
   an already-working system, likely a quick, high-value fix once
   investigated.
4. **Chathead rendering** — cosmetic but visible on every single NPC
   interaction; worth finishing what we started.
5. Everything else marked `[CODE]` — spot-check in normal play as you go
   rather than a dedicated pass; most of it looks solid from the boot logs
   and file structure alone.
