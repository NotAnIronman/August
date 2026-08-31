# XRSPS Cleanup Roadmap

Living document tracking the top-down cleanup effort. Goal: a codebase any
dev on the team can walk into, understand quickly, and modify safely — not
a rewrite for its own sake. Every phase should leave the server in a
verifiably working state (`yarn --cwd server typecheck` clean, existing
tests passing) before moving to the next.

Audited: 2026-08-19. ~103K lines server, ~128K lines client.

---

## Done

- **Transport-layer JSON/binary misclassification** (`BinaryBridge.ts`) —
  fixed. Any legacy opcode matching an ASCII whitespace byte (9, 10, 13, 32)
  was silently dropped as "non-binary." Narrowed to only `{`/`[`.
- **Tick-loop poison-message lockup** (`ChatBroadcaster.ts`) — fixed. An
  unencodable chat message used to abort the whole broadcast phase and get
  retried forever every tick. Now caught and dropped per-message.
- **`inventoryChat.ts` `sendChat()`** — removed unconditional verbose
  `console.log` tracing (fired on every single chat message sent); kept a
  `console.warn` for the one case worth knowing about (socket not open).
- **Chathead debug diagnostic removed** from `OsrsClient.ts` now that the
  `modelZoom` root cause is understood and guarded against.

---

## Phase 1 — Mechanical cleanup (low risk, in progress)

**Client `console.log` audit.** 90 files, ~376 calls. Sampled and confirmed
the pattern: some are legitimate (dev tooling in `scripts/cache/*`, test
files, `devoverlay/*`, `DebugControls.tsx` — these are *meant* to log and
should stay as-is), but a meaningful chunk are unconditional debug tracing
left in hot runtime paths (confirmed in `inventoryChat.ts`, likely similar
in `widgetActionHandlers.ts` (13 calls), `inboundUi.ts`, and others in
`client/network/serverConnection/**` and `client/game/widgets/**`).

Recommended fix, not a blind delete: introduce a `clientLogger` module
mirroring the server's existing `server/src/utils/logger.ts` (level-gated,
env/localStorage-configurable, `debug`/`info`/`warn`/`error`). Then do a
file-by-file pass converting each `console.log` to either:
- deleted, if it's pure "I was here" tracing with no ongoing value, or
- `clientLogger.debug(...)`, if it's genuinely useful during development
  but shouldn't spam production consoles by default.

Suggested order (highest-traffic runtime paths first, since those are what
new devs will be staring at while debugging):
1. `client/network/serverConnection/**` (connection lifecycle, inbound
   handlers) — remaining files after `inventoryChat.ts`
2. `client/game/widgets/**` (widget action routing)
3. `client/rs/cs2/**` (CS2 script VM/ops — high call volume, worth checking
   these aren't logging per-frame)
4. Everything else, lowest priority: `client/render/**`,
   `client/game/ecs/**`, `client/game/audio/**`

**TODO/FIXME backlog.** 12 in server, 9 in client. Small enough to triage
directly — worth a pass to either resolve or convert into tracked issues
rather than silent comments nobody revisits.

---

## Phase 2 — Split `OsrsClient.ts` (medium risk, high value)

**7,632 lines, one file, one class.** It currently owns widget-event
handling, chatheads, dialogue wiring, examine, appearance, movement, and
more. This is the file we kept coming back to all session — every fix
(`set_npc_head`, examine wiring, chathead debug) touched it. It's the
single highest-leverage modularity target in the client.

Concrete structure found: a large `if (payload?.action === "...") {...}
else if (...)` chain (~2150–2520, 15 branches) dispatching widget events
(`close`, `open`, `set_root`, `open_sub`, `close_sub`, `set_text`,
`set_hidden`, `set_item`, `set_npc_head`, `set_animation`,
`set_player_head`, `set_quest_list`, `set_flags`, `set_flags_range`,
`run_script`).

**Proposed approach:**
1. Extract this dispatch chain into a `WidgetEventHandlers` map
   (`Record<string, (client: OsrsClient, w: WidgetNode, payload) => void>`)
   in a new `client/game/widgets/WidgetEventDispatcher.ts`. Each handler
   becomes its own named function — testable in isolation, and exactly
   where a future `set_*` action gets added without touching a 7K-line
   file.
2. Repeat the same extraction pattern for the other major responsibility
   clusters already visible in the file: appearance/ECS wiring, chathead
   setup, examine (`examineWidgetItem` and friends), music/sound
   triggers.
3. `OsrsClient` becomes a thin coordinator holding references to these
   extracted modules, not the owner of their logic.

Do this incrementally, one extraction at a time, typechecking after each
— not as one giant diff. A single extraction with a botched import or
`this`-binding mistake in a file this central would be a bad day.

---

## Phase 3 — Consolidate the dual network protocol (high risk, biggest structural win)

**Two parallel client→server binary protocols coexist:**
- "Legacy" OSRS-opcode protocol (opcodes ~1–103), parsed by
  `PacketHandler.ts` / `LoginHandshakeService.ts`.
- "New" JSON-replacement protocol (opcodes 180+), parsed by
  `ClientBinaryDecoder.ts` → `MessageRouter`.

A single first-byte heuristic (`isNewProtocolPacket`, `isBinaryData`)
decides which parser a given raw WebSocket message goes to. This is
exactly what caused this session's `EXAMINE_NPC` bug (opcode 9 collided
with the JSON-detection heuristic) — a whole class of legacy opcodes was
one byte value away from being silently misrouted.

This is real, load-bearing debt spread across 28 files (see `grep -rl
"legacy\|deprecated" server/src` for the current list) — not dead code to
delete, but two systems doing the same job that should be one.

**This needs a design decision before code changes, not just execution:**
which protocol becomes canonical? Given the new protocol already has
DEALT-with debugging via `ClientBinaryDecoder.ts`'s explicit opcode cases
and cleaner type-safety, migrating legacy opcodes onto it (rather than the
reverse) is probably right — but that's a call worth making deliberately
with the numbers in front of you (how many packet types are legacy-only,
how much client-side rework each migration needs) rather than me assuming
it here.

**Recommended first step, low-risk and immediately useful regardless of
the final direction:** audit every opcode in
`client/common/network/ClientPacketId.ts` against
`client/common/packets/ClientPacketId.ts` for the same first-byte-range
collision class of bug we just fixed (values 9, 10, 13, 32, 91, 123 in
either range are the danger zone). We already know `EXAMINE_NPC` (9),
`OPPLAYER7` (10), `IF_BUTTON` (13), and `OPPLAYER_T` (32) are in the
legacy enum at these values — worth confirming none of them are *also*
still silently broken by some other narrower assumption before starting
the bigger consolidation.

---

## Other findings, lower priority

- **Type safety erosion:** ~1,200+ `any` usages across client+server
  (259 server, 973+ in the client subset checked). Not urgent as a bulk
  fix — the value is in stopping *new* `any` usage and tightening types
  incrementally as each area gets touched during Phase 2/3 work, not a
  standalone sweep.
- **Other large files worth splitting eventually** (post Phase 2):
  `CombatHitProcessor.ts` (2,110 lines), `ServerBinaryEncoder.ts` (1,882),
  `DoorStateManager.ts` (1,794), `renderWidgetTree.ts` (4,171, client),
  `PlayerEcs.ts` (2,756, client).
