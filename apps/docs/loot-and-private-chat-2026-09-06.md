# Loot and private-chat follow-up — 2026-09-06

## Changes

- Ground-item Alt `+` / `-` controls now toggle their exact-name highlight/hide entry off as well as on. Alt continues to reveal hidden items for editing.
- Amethyst 11388 and 11389 deplete into cache object **11393, Empty wall**, preserving their shape-0 wall placement. The old 11390/11391 IDs are ordinary ground rocks, which cannot render at that placement. Multi-yield depletion remains unchanged.
- Private-message pre-submission no longer clears the native message buffer before script 681 runs. That bypassed its Private-chat filter change. Duplicate sends are suppressed at opcode 5009 instead. Incoming chat records now identify friends, and the wire channel labels use native OSRS chat types (received PM 3, sent PM 6).
- Loot windows use native-size 36×32 icons in compact 42×40 cells, without slot backplates or a subtitle. Resizing does not inflate items or gaps.
- Bottom-left artwork uses the actual Barrows, Monumental and Lunar chest models, fitted without stretching. Cache assets supply the stone buttons, inventory/bank arrows, and world-map resize grip.
- Theatre retains its durable reward storage. Barrows and Moons now keep rolled rewards in account-backed pending containers instead of immediately giving/dropping them. Choose collect-to-inventory, collect-to-bank, or claim an individual item. Partial inventory insertion keeps the remainder in the chest.
- Reward rolls and claims synchronously save account state. Failed saves roll back item changes. Closing the interface or reconnecting does not reroll or discard rewards. Reopen Lunar loot at its chest; unclaimed Barrows loot can also be reopened from a sarcophagus.
- Shared reward action handlers are registered by the vanilla gamemode, independently of Theatre.

## Validation

- Client and server runtime/test typechecks.
- Focused tests for real cache friend-prompt typing/Enter, Private-off → Friends transition, single-send behavior, binary PM delivery to exactly sender and recipient, loot partial claims, individual bank claims, reconnect rehydration, failed-save rollback, stale clicks, persistence sanitization, Theatre claims, ground-item toggles, and amethyst cache geometry.
- Chest models and native button/grip assets were software-rendered from the cache and visually inspected.
- Production client build succeeded: `main.038bd11d.js` (925.79 kB gzip). Twelve focused test files passed, together with client/server runtime and test typechecks. Repository boundary, documentation-link and client-build artifact checks passed.

## Host testing

Deploy the matching client and server changes, rebuild on the host, restart the server, and reload clients. The binary chat channel mapping changed on both ends.

Please verify private messages between two actual accounts (including Private set to Friends/Off), all three loot sources and their bank/inventory buttons, reopening a partially claimed chest after reconnect, and a full amethyst deplete/respawn cycle. Automated checks do not replace live multiplayer or in-game UI testing.
