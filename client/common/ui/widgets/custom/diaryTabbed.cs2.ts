/**
 * Custom "achievement diary" tabbed widget group.
 *
 * Same sidebar-tabs + scrollable-content-list architecture as the skill
 * guide (see skillGuideTabbed.cs2.ts), reused per the user's request -
 * but with plain colored/strikethrough text rows instead of icon
 * entries, since diary tasks don't have item icons. Tabs are always
 * exactly Easy/Medium/Hard/Elite (see diaryJournalWidgets.ts).
 */

export const DIARY_TABBED_COMPONENT_ROOT = 0;
export const DIARY_TABBED_COMPONENT_FRAME = 1;
/** Vertical divider between the sidebar and the content area. */
export const DIARY_TABBED_COMPONENT_DIVIDER = 2;

/**
 * Active-tab background highlight, one per tab slot. Component ids 3..6.
 * Numbered BELOW the tab text's ids on purpose (see
 * ComponentIds.TAB_HIGHLIGHT_BASE in client/widgets/uikit/types.ts for
 * the full explanation): WidgetManager sorts static children by fileId
 * ascending for layering, so the highlight must have the lower id or it
 * draws on top of (and hides) the label.
 */
export const DIARY_TABBED_COMPONENT_TAB_HIGHLIGHT_BASE = 3;
/** Sidebar tab buttons (Easy/Medium/Hard/Elite), fixed at 4. Component ids 7..10. */
export const DIARY_TABBED_COMPONENT_TAB_BASE = 7;
export const DIARY_TABBED_TAB_COUNT = 4;

/** Scrollable content viewport (clips + scrolls its line-row children). */
export const DIARY_TABBED_COMPONENT_CONTENT_VIEW = 15;
/** Scrollbar column to the right of the content viewport. */
export const DIARY_TABBED_COMPONENT_SCROLLBAR = 16;
/** Scrollbar track (static background, full scrollbar height). */
export const DIARY_TABBED_COMPONENT_SCROLLBAR_TRACK = 17;
/** Scrollbar thumb (repositioned/resized at runtime by the input handler). */
export const DIARY_TABBED_COMPONENT_SCROLLBAR_THUMB = 18;

/**
 * Content rows: one text line each. Component ids 20..69 (50 slots) -
 * generous headroom for a tier's task list; real areas currently top
 * out well under this (Karamja Medium is the largest at 19 tasks).
 */
export const DIARY_TABBED_COMPONENT_LINE_BASE = 20;
export const DIARY_TABBED_MAX_LINES = 50;
