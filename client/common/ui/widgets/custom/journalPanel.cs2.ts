/**
 * Custom panel group ids for quest journal, quest overview, achievement
 * diary, skill guide, and developer UIKit test panels.
 *
 * These replace the cache-sourced Quest Journal (119), Quest Overview
 * (782), Achievement Diary scroll (741) and Skill Guide (214) interfaces,
 * which do not render a visible background/frame in this client.
 *
 * All four are now built with the UI kit (client/widgets/uikit/) - see
 * client/widgets/custom/questJournalPanel.ts (registers both quest
 * journal and quest overview), diaryPanel.ts, and skillGuidePanel.ts.
 * Only the group ids live here; the component layout is the kit's
 * shared ComponentIds scheme (client/widgets/uikit/types.ts), not a
 * bespoke one per panel anymore.
 */

export const QUEST_JOURNAL_PANEL_GROUP_ID = 30020;
export const QUEST_OVERVIEW_PANEL_GROUP_ID = 30021;
export const ACHIEVEMENT_DIARY_PANEL_GROUP_ID = 30022;
export const SKILL_GUIDE_PANEL_GROUP_ID = 30023;
/** Developer-only UIKit component showcase (opened with ::Dev). */
export const DEV_UIKIT_TEXT_PANEL_GROUP_ID = 30024;
export const DEV_UIKIT_ICON_PANEL_GROUP_ID = 30025;
export const DEV_UIKIT_MENU_PANEL_GROUP_ID = 30026;
/** Developer-only launcher for inspecting native cache interface components. */
export const DEV_UIKIT_COMPONENTS_PANEL_GROUP_ID = 30027;
/** Developer-only cache-widget asset/component picker. */
export const DEV_UIKIT_COMPONENT_PICKER_GROUP_ID = 30028;
/** Developer-only paginated visual browser for every sprite in the cache. */
export const DEV_UIKIT_SPRITE_GALLERY_GROUP_ID = 30029;
export const DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID = 30030;
