/**
 * Custom "journal panel" widget groups.
 *
 * These replace the cache-sourced Quest Journal (119), Quest Overview (782),
 * Achievement Diary scroll (741) and Skill Guide (214) interfaces, which do
 * not render a visible background/frame in this client.
 *
 * Instead of depending on those cache interfaces, each panel below is built
 * entirely in TypeScript (same approach as the Smithing bar picker and the
 * Item Spawner) and its frame/backdrop is drawn at runtime via the generic
 * `steelborder` clientscript - the exact same mechanism Bank, the Settings
 * modal, the spellbook minigame picker, and the Smithing bar picker already
 * use successfully. All four panels share one component layout so a single
 * builder function can produce any of them.
 */

// One shared component layout, reused by every panel group below.
export const JOURNAL_PANEL_COMPONENT_ROOT = 0;
export const JOURNAL_PANEL_COMPONENT_FRAME = 1;
/**
 * No separate title or close-button component: SCRIPT_STEELBORDER (227)
 * draws both directly onto the frame (title bar text + a working X close
 * button), matching Bank/Settings/Trade native chrome. Building our own
 * title text and close button on top of that duplicated the title and
 * produced a second, non-functional close control - so neither is built
 * here anymore.
 */
/** Optional second button (e.g. "View Quest Overview" / "View Journal"). */
export const JOURNAL_PANEL_COMPONENT_SWITCH = 21;

/**
 * Body text is rendered as one child widget per line (same convention the
 * old quest journal/diary scroll interfaces used) rather than a single
 * auto-wrapping text block, since this engine positions text per-widget
 * rather than flowing it. Component ids 40..63 -> up to 24 lines.
 */
export const JOURNAL_PANEL_COMPONENT_LINE_BASE = 40;
export const JOURNAL_PANEL_MAX_LINES = 24;

/**
 * A blank string ("") in a quest/diary line array marks a section break
 * (e.g. between "how to start" and "requirements" text). Each line slot
 * has a matching divider slot at the same Y position - the server shows
 * whichever of the pair is appropriate for that line (divider for "",
 * text otherwise) via set_hidden. Component ids 70..93.
 */
export const JOURNAL_PANEL_COMPONENT_DIVIDER_BASE = 70;

/**
 * Centered variant of each line slot, used for header-style lines (e.g.
 * achievement diary tier headers "Easy tasks: 10/10") instead of the
 * normal left-aligned text widget. Component ids 100..123.
 */
export const JOURNAL_PANEL_COMPONENT_CENTER_BASE = 100;

export const QUEST_JOURNAL_PANEL_GROUP_ID = 30020;
export const QUEST_OVERVIEW_PANEL_GROUP_ID = 30021;
export const ACHIEVEMENT_DIARY_PANEL_GROUP_ID = 30022;
export const SKILL_GUIDE_PANEL_GROUP_ID = 30023;
