/** Serializable contract shared by browser UIKit and server presenters. */
export const ComponentIds = {
    ROOT: 0, FRAME: 1, SIDEBAR_DIVIDER: 2,
    /**
     * Native tab backgrounds must render before their labels.  Keeping the
     * idle/active layers in the first component slots and the labels later
     * gives cache sprites the same stacking order as the game's own tabs.
     */
    TAB_BACKGROUND_BASE: 3, TAB_HIGHLIGHT_BASE: 13, MAX_TABS: 10,
    TAB_BASE: 1130,
    CONTENT_VIEW: 30, SCROLLBAR: 31, SCROLLBAR_TRACK: 32, SCROLLBAR_THUMB: 33,
    TEXT_ROW_LINE_BASE: 40, TEXT_ROW_DIVIDER_BASE: 140, TEXT_ROW_CENTER_BASE: 240,
    /** A container below all icon-row foreground widgets; its children hold
     *  optional alternating row surfaces. */
    ICON_ROW_BACKGROUND_LAYER: 340,
    ICON_ROW_LEVEL_BASE: 400, ICON_ROW_ICON_BASE: 500, ICON_ROW_NAME_BASE: 600,
    ICON_ROW_DESC_BASE: 700, MAX_ROWS: 100, FOOTER_BUTTON: 900, FOOTER_BUTTON_LABEL: 901,
    SEARCH_BACKGROUND: 910, SEARCH_TEXT: 911,
    CONTROL_BACKGROUND_BASE: 920, CONTROL_LABEL_BASE: 930, CONTROL_ICON_BASE: 940, MAX_CONTROLS: 8,
    /** Fixed, non-scrolling information column available beside text content. */
    INFO_COLUMN_DIVIDER: 950, INFO_COLUMN_ROW_BASE: 960, MAX_INFO_COLUMN_ROWS: 16,
    MENU_BUTTON_BACKGROUND_BASE: 1000, MENU_BUTTON_ICON_BASE: 1040,
    MENU_BUTTON_LABEL_BASE: 1080, MAX_MENU_BUTTONS: 24,
    /** Client-local metadata and rows for cache interface component inspection. */
    PICKER_SOURCE: 1200, PICKER_ROW_PREVIEW_BASE: 2000,
    PICKER_ROW_LABEL_BASE: 2600, PICKER_ROW_ALT_PREVIEW_BASE: 3200,
    MAX_PICKER_ROWS: 500,
    /** Fixed thumbnail grid used by the dedicated full-cache sprite browser. */
    SPRITE_GALLERY_SOURCE: 1201, SPRITE_GALLERY_FILTER: 1202,
    SPRITE_GALLERY_CELL_BASE: 4000,
    SPRITE_GALLERY_LABEL_BASE: 4100, MAX_SPRITE_GALLERY_CELLS: 48,
    /** Invisible full-cell click/hover target, decoupled from the tightly
     *  aspect-fit preview widget (which shrinks to the sprite's own scaled
     *  pixel size and leaves real dead space around small/narrow icons).
     *  Click and right-click hit-testing use this instead of the preview's
     *  own (visually correct but too-small-to-reliably-click) bounds. */
    SPRITE_GALLERY_HITZONE_BASE: 4200,
    /** Invisible full-row click/right-click target for any "text" content
     *  panel that opts in via content.clickableRows - lets a panel (e.g.
     *  the Dialogue Editor) treat clicking a rendered row as selecting or
     *  editing whatever it represents, the same way SPRITE_GALLERY_HITZONE
     *  does for grid cells. Sized to MAX_ROWS so it can parallel every
     *  possible text row 1:1. */
    DIALOGUE_ROW_HITZONE_BASE: 4300,
    /** Single invisible widget a panel's server side toggles hidden=false
     *  to ask the client to focus/activate its search box - e.g. the
     *  Dialogue Editor's toolbar "Add Line"/"Add Reply" buttons arm a
     *  pending action server-side and need the box focused for it, but a
     *  server-processed button click has no client-local hook of its own
     *  (unlike a row click) to call searchController.setActive() from
     *  directly. See devUIKitPanels.ts's onProcess poll for the client side. */
    DIALOGUE_ACTIVATE_SIGNAL: 4400,
    /** Per-row Up/Down/Delete icon buttons for a "text" content panel with
     *  content.inlineRowActions - a real clickable widget per row per
     *  action (not client-side hit-testing sub-regions of the row), same
     *  proven click-registration mechanism as CONTROL_BACKGROUND_BASE.
     *  Capped lower than MAX_ROWS/DIALOGUE_ROW_HITZONE_BASE's 100 (see
     *  INLINE_ROW_ACTION_CAPACITY) since 3 widgets x 100 rows was judged
     *  more risk than the benefit justified for rows a session realistically
     *  uses - selection/edit via the row itself still covers all 100. */
    ROW_MOVE_UP_BASE: 4410,
    ROW_MOVE_DOWN_BASE: 4460,
    ROW_DELETE_BASE: 4510,
    INLINE_ROW_ACTION_CAPACITY: 40,
    /** Children of ICON_ROW_BACKGROUND_LAYER. Their high IDs are safe
     *  because the layer itself renders before all icon row foregrounds. */
    ICON_ROW_BACKGROUND_BASE: 4700,
    /** Vertically centred primary labels for icon rows with no secondary text. */
    ICON_ROW_CENTERED_NAME_BASE: 4800,
} as const;

export type UiRowKind = "text" | "icon" | "mixed" | "picker" | "sprite-gallery";
export type UiTabPosition = "left" | "top";
export type UiTextAlignment = "left" | "center";
export type UiTextStyle = { color?: string; bold?: boolean; strikethrough?: boolean };

/** String rows remain supported by server helpers during migration. */
export type UiTextRow =
    | { kind: "text"; text: string; align?: UiTextAlignment; style?: UiTextStyle }
    | { kind: "heading"; text: string; style?: UiTextStyle }
    | { kind: "divider" }
    | { kind: "spacer" };

export type UiIconRow = {
    itemId: number; level: number; name: string; description?: string;
    /** Optional display override for the left cell (for example "x25" in a drop table). */
    levelLabel?: string;
    /** 0 is opaque and 255 is fully transparent, matching WidgetNode. */
    transparency?: number;
};

/** One server-authoritative large button in a two-column menu grid. */
export type UiMenuButton = { itemId: number; label: string; transparency?: number };
export type UiPanelRow = UiTextRow | UiIconRow;

/** An intent only; the server must register and validate every action. */
export type UiActionId = string;

/**
 * Cache-first presentation choices for one UIKit panel.  Every value is a
 * semantic cache key (for example "ui.tab-base"), a raw gallery reference
 * ("cache.sprite.185.0"), or a cached widget reference
 * ("cache.widget.116.11.sprite").  The resolver intentionally supports all
 * three so a discovered cache asset becomes immediately reusable without a
 * new builder feature.
 */
export type UiPanelSkin = {
    /** The outer frame remains the native steelborder cache script by default. */
    tabs?: {
        backgroundAsset?: string;
        activeAsset?: string;
    };
    /** Visual used for menu/control/footer buttons when a suitable cache
     * button skin has been identified. Undefined preserves the safe native
     * rectangle fallback rather than stretching an unrelated sprite. */
    button?: { backgroundAsset?: string; hoverAsset?: string };
    /** Optional cache artwork behind the local search field. */
    input?: { backgroundAsset?: string; hoverAsset?: string };
};

export type UiPanelLayout = {
    width: number; height: number;
    /** Cache-first skin shared by all reusable pieces of this panel. */
    skin?: UiPanelSkin;
    sidebar?: { width: number };
    /** Preferred spelling for new panels; sidebar remains backwards compatible. */
    tabs?: {
        position: UiTabPosition; width?: number; height?: number;
        /** Centers left-sidebar tab labels inside their selected rectangle. */
        textAlignment?: UiTextAlignment;
        /** Native idle-tab artwork. Defaults to UIKit's cache-backed skin. */
        backgroundAsset?: string;
        /** Native active-tab artwork. Defaults to UIKit's cache-backed skin. */
        backgroundHoverAsset?: string;
    };
    content: { rowKind: UiRowKind; rowHeight: number; scrollbarWidth: number; rowCapacity?: number;
        /** Height of an icon row's primary label. Defaults to 16 pixels. */
        iconRowNameHeight?: number;
        /** Height of an icon row's secondary label. Defaults to 16 pixels.
         *  Give this more space when that line needs automatic text wrapping. */
        iconRowDescriptionHeight?: number;
        /** Optional subtle surface behind every other populated icon row. */
        iconRowAlternateBackground?: boolean | { color?: number; transparency?: number };
        /** Builds a vertically centred name variant for icon rows without
         *  secondary text, so simple entries do not reserve blank space. */
        iconRowCenterNameWithoutDescription?: boolean;
        /** Builds an invisible full-row hit-zone (DIALOGUE_ROW_HITZONE_BASE)
         *  behind every "text"/"mixed" row, up to MAX_ROWS, for panels that
         *  want per-row click/right-click via GalleryClickController rather
         *  than typed selection. */
        clickableRows?: boolean;
        /** Builds real clickable Up/Down/Delete icon widgets at the right
         *  edge of the first INLINE_ROW_ACTION_CAPACITY rows (see
         *  contracts.ts) - reduces those rows' own text width to leave
         *  room. Independent of clickableRows (a panel can have one, both,
         *  or neither). */
        inlineRowActions?: boolean };
    /** A static right-hand column separate from the scrollable main content. */
    infoColumn?: { width: number; gap?: number; rowHeight?: number; rowCapacity?: number };
    /** Defaults to true. Blocks world input for every pixel inside the modal. */
    inputCapture?: boolean;
    /** Simple local background for developer tools that do not use steelborder. */
    plainFrame?: boolean;
    footerButton?: boolean;
    /** A bottom-aligned row of reusable server-authoritative action buttons. */
    controls?: { width?: number; height?: number; gap?: number; count?: number };
    /** A local input primitive. Server filtering must use an explicit validated action. */
    search?: { placeholder: string; width?: number };
    /** Large item-icon buttons, laid out in a two-column grid inside content. */
    menuButtons?: {
        columns?: 2; rows?: number; buttonHeight?: number; gap?: number; iconSize?: number;
        /** Optional semantic cache skin, resolved client-side by UIKit. */
        backgroundAsset?: string;
        /** Swapped in on mouse-over (real hover, not "active tab"). */
        backgroundHoverAsset?: string;
        /** Keeps a menu grid compact instead of letting it occupy the whole panel. */
        maxHeightFraction?: number;
        /** Limits the grid width and centres it within the content column. */
        maxWidthFraction?: number;
    };
};

export type UiTab = { label: string };
/** label and sprite can both be set (icon + short caption side by side,
 *  since a bare icon turned out not to be self-explanatory - see
 *  devDialogueEditor.ts's toolbar); either alone still works as before. */
export type UiControl = { label?: string; sprite?: { archiveId: number; frame: number } };
