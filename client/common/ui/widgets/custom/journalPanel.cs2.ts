/**
 * Custom panel group ids for quest journal, quest overview, achievement
 * diary, and skill guide.
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
