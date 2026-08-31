/**
 * Default varbit values applied during login for the vanilla gamemode.
 * Includes achievement diary unlocks, XP drop toggle, and music unlock toggle.
 */
import {
    VARBIT_MUSIC_UNLOCK_TEXT_TOGGLE,
    VARBIT_ROOF_REMOVAL,
    VARBIT_XPDROPS_ENABLED,
} from "@august/game-model/state/vars";

export const DIARY_VARBITS: Array<[number, number]> = [
    // === STARTED FLAGS (1 = started) ===
    // Diaries are unlocked/visible from the start on this server rather than
    // requiring players to first find and speak to each area's diary NPC.
    // This only controls whether a diary shows up in the list at all — it
    // does not mark any progress or tasks as done.
    [3576, 1], // Karamja (atjun_started)
    [4448, 1], // Ardougne
    [4449, 1], // Falador
    [4450, 1], // Fremennik
    [4451, 1], // Kandarin
    [4452, 1], // Desert
    [4453, 1], // Lumbridge
    [4454, 1], // Morytania
    [4455, 1], // Varrock
    [4456, 1], // Western
    [4457, 1], // Wilderness
    [7924, 1], // Kourend

    // NOTE: this array used to also unconditionally set every tier's
    // COMPLETION flag to 1, every tier's TASK COUNT varbit to that tier's
    // max, and every REWARD flag to 1 (claimed) — for every player, on
    // every login. That's why the achievement diary UI and the character
    // panel's "Achievements completed" counter always showed 100%/fully
    // claimed even with zero real task-completion tracking behind them:
    // this file was the one thing pretending they were done. Removed all
    // three of those sections so those varbits are left at their real
    // default of 0 (not started/not complete/not claimed), matching a
    // genuinely fresh player, and now update correctly once
    // achievementTaskTracker (see AchievementTaskTracker.ts) actually
    // tracks real progress against the same varbit IDs diaryJournalWidgets
    // .ts reads.
];

export const DEFAULT_LOGIN_VARBITS: Array<[number, number]> = [
    ...DIARY_VARBITS,
    [VARBIT_XPDROPS_ENABLED, 1],
    [VARBIT_MUSIC_UNLOCK_TEXT_TOGGLE, 1],
    [VARBIT_ROOF_REMOVAL, 1], // Hide roofs by default
    // Quest journal defaults
    [6347, 0], // quests_completed_count
    [11877, 158], // quests_total_count (158 total quests in OSRS)
    [1782, 300], // qp_max
];
