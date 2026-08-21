/**
 * UI Kit - shared types.
 *
 * This is the single config surface for every custom panel built in this
 * project from here on. The goal (per the project's own direction): fix
 * a primitive once here, every panel built on it is fixed automatically,
 * instead of patching the same bug in N copy-pasted files.
 *
 * A "panel" built with this kit always has the same skeleton:
 *   root -> frame (steelborder target) -> [optional sidebar of tabs]
 *                                       -> content area (rows, optionally
 *                                          scrollable) -> [optional
 *                                          scrollbar]
 *
 * Component id layout is fixed and shared across every panel (see
 * ComponentIds below) - this is what lets the generic scroll controller,
 * the generic tab-highlight logic, etc. work for ANY panel without each
 * one redefining its own numbering.
 */

/** Fixed component id layout, reused by every panel this kit builds. */
export const ComponentIds = {
    ROOT: 0,
    FRAME: 1,
    /** Vertical divider between sidebar and content, when a sidebar exists. */
    SIDEBAR_DIVIDER: 2,

    /** Up to 10 sidebar tab slots. */
    TAB_HIGHLIGHT_BASE: 3, // 3..12 - MUST be numbered below TAB_BASE (see
    // the fileId z-order note on MAX_TABS below) so the highlight rect
    // draws behind the label, not on top of it.
    TAB_BASE: 13, // 13..22
    MAX_TABS: 10,

    /** Scrollable content viewport + scrollbar. */
    CONTENT_VIEW: 30,
    SCROLLBAR: 31,
    SCROLLBAR_TRACK: 32,
    SCROLLBAR_THUMB: 33,

    /** "textRow" row kind: one plain text widget per row, plus a paired
     *  divider (for blank-line section breaks) and a paired centered
     *  variant (for header-style lines). Up to 100 rows. */
    TEXT_ROW_LINE_BASE: 40, // 40..139
    TEXT_ROW_DIVIDER_BASE: 140, // 140..239
    TEXT_ROW_CENTER_BASE: 240, // 240..339

    /** "iconRow" row kind: level + icon + name + description, one set
     *  per row. Up to 100 rows. */
    ICON_ROW_LEVEL_BASE: 400, // 400..499
    ICON_ROW_ICON_BASE: 500, // 500..599
    ICON_ROW_NAME_BASE: 600, // 600..699
    ICON_ROW_DESC_BASE: 700, // 700..799

    MAX_ROWS: 100,

    /** Optional single footer action button (e.g. quest journal's
     *  "View Quest Overview" toggle). */
    FOOTER_BUTTON: 900,
} as const;

/**
 * WidgetManager sorts a widget's static children by fileId ascending for
 * layering (matches real OSRS updateInterface order) - found the hard way
 * building the skill guide's tab highlight. Any two components that visually
 * overlap must respect this: the one that should draw UNDERNEATH needs the
 * LOWER component id. This is why TAB_HIGHLIGHT_BASE (3) < TAB_BASE (13).
 */

export type UiRowKind = "text" | "icon";

export interface UiPanelLayout {
    width: number;
    height: number;
    /** Sidebar tab list on the left. Omit for a panel with no tabs. */
    sidebar?: {
        width: number;
    };
    /** Content area - where rows render, scrollable if there are more
     *  rows than fit in the visible height. */
    content: {
        rowKind: UiRowKind;
        rowHeight: number;
        /** Reserved for the scrollbar column, so content doesn't overlap
         *  it and text doesn't get clipped by the frame's right edge. */
        scrollbarWidth: number;
    };
    /** A single bottom-center action button, e.g. quest journal's
     *  "View Quest Overview" toggle. Its label is set server-side (same
     *  set_text mechanism as everything else) since it can vary per
     *  panel instance (e.g. "View Journal" vs "View Quest Overview"). */
    footerButton?: boolean;
}

/** A single tab in a panel's sidebar. */
export interface UiTab {
    label: string;
}

/** One row for the "text" row kind - a plain line of (possibly marked-up)
 *  text. A blank string ("") renders as a divider instead of a line -
 *  see textMarkup.ts's centerLine()/dividerLine() semantics. */
export interface UiTextRow {
    text: string;
}

/** One row for the "icon" row kind - level + item icon + name + optional
 *  description, matching the skill guide's entry layout. */
export interface UiIconRow {
    itemId: number;
    level: number;
    name: string;
    description?: string;
}
