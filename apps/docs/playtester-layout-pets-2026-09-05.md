# Layout, status orbs, Araxxor and pets — 2026-09-05

## Host update

Sync the complete source changes, rebuild the client, and restart the game server. Both sides changed, including a new pet-examine packet; do not update only one side.

From the repository root:

```powershell
pnpm --filter @august/client build
```

Restart using your usual server command. The server runs TypeScript directly, so no separate emitted server build is required. Players should hard-refresh once to obtain the new client bundle. Subsequent layout switches are intended to work without reloading. No cache rebuild or player-save deletion is required.

## Changes

- Layout packets remain ordered while widget groups and their script dependencies download. Parent-interface callbacks are included. Detached layouts cannot run stale widget events, and resizing occurs after the new root is installed.
- The canvas parent receives game input, preventing the canvas itself from becoming the browser's image-menu target. Secondary-button context menus and auxiliary clicks are cancelled. Canvas coordinates and mobile login input remain supported. Browser-reserved gestures or extension controls still require live confirmation in Brave.
- Active poison and venom synchronize the native health-orb status varp, including clearing it after a cure.
- Mirrorbacks receive half of a player hit redirected from Araxxor, then recoil half of the damage they actually received. Both divisions round down; recoil is capped by the mirrorback's remaining HP. This follows the requested explicit 50% then 50% calculation: ordinarily **25%, not 10%, of the original hit** reaches the player.
- Direct adjacent melee hits on a mirrorback recoil half the actual damage, rounded down. Ranged and magic do not recoil; melee at two-tile halberd reach does not recoil. Noxious halberd, crush attacks, crossbows and light/heavy ballista force a successful maximum hit. Casting magic while holding a qualifying weapon does not qualify.
- Araxxor eggs have no idle, movement, spawn, hatch, defence or death animations.
- Each new level-up immediately replaces the previous level-up popup.
- Other players' pets expose Examine, but not Talk-to or Pick-up. The server also rejects non-owner interactions.
- First boss-pet acquisition killcounts are saved per pet family, logged at acquisition, and displayed when examining the owner's active pet. Variants share the record and duplicate drops do not overwrite it. Drop metadata preserves the killcount at the original roll, including delayed delivery.
- Boss health bars default to Oldschool for new or unset preferences. Existing explicit Modern preferences are preserved.

## Killcount limitations

Accurate acquisition records require a supported pet and a registered boss killcount source. Araxxor's corpse reward supplies its killcount explicitly; ordinary NPC drops use the registered encounter counter. Historical pets without an acquisition record report that the killcount was not recorded. The system does not invent a past killcount from the player's current total. A historical pet already in the collection log will not acquire a false first-drop record on a later duplicate.

## Host QA checklist

1. On desktop, cycle Fixed Classic, Resizable Classic and Resizable Modern repeatedly without reloading. Confirm tabs, inventory, minimap and mouse targets remain usable, both with warm assets and after a fresh client load. Confirm mobile retains its own layout behavior.
2. In Brave, Shift-right-click the game and confirm the game menu appears without the browser image menu. Also test normal right-click, middle-button camera movement, sidebar controls and mobile login typing.
3. Apply poison, then venom, then cure. Confirm the health orb changes and returns to normal; relog and repeat.
4. With a live mirrorback, a 100-point boss hit should deal 50 to the boss, 50 to the mirrorback and 25 to the player. Repeat with a nearly dead mirrorback and confirm recoil uses actual remaining HP. Confirm no redirection after it dies or across instances.
5. Hit a mirrorback with adjacent melee, ranged, magic and a halberd at two-tile reach. Check recoil and the qualifying maximum-hit weapons/styles. Watch eggs through spawn, damage and hatching for any animation.
6. Gain several Strength levels while standing still. The displayed level-up must be the latest level.
7. With two accounts, inspect each other's pets: no Talk-to/Pick-up, but Examine reports the owner's recorded acquisition KC. Relog, transform the pet and obtain a duplicate to verify the original record remains unchanged. Verify an older pet reports an unknown acquisition KC.
8. Test a fresh health-bar preference and an existing Modern preference: the former is Oldschool, the latter stays Modern.

## Automated verification

The standard server suite passed all 190 test files, and the standard client suite passed all 51. Runtime/test type checks and repository checks passed. Added regressions cover real-cache layout transitions and missing script dependencies, native poison/venom orb scripts, input listener lifecycle, Mirrorback damage and max-hit rolls, animation-free egg definitions, pet ownership and packet validation, persistence and level-up replacement.

These checks do not substitute for the live hosted-client and Brave QA above.
