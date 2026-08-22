/** Serializable contract shared by browser UIKit and server presenters. */
export const ComponentIds = {
    ROOT: 0, FRAME: 1, SIDEBAR_DIVIDER: 2,
    TAB_HIGHLIGHT_BASE: 3, TAB_BASE: 13, MAX_TABS: 10,
    CONTENT_VIEW: 30, SCROLLBAR: 31, SCROLLBAR_TRACK: 32, SCROLLBAR_THUMB: 33,
    TEXT_ROW_LINE_BASE: 40, TEXT_ROW_DIVIDER_BASE: 140, TEXT_ROW_CENTER_BASE: 240,
    ICON_ROW_LEVEL_BASE: 400, ICON_ROW_ICON_BASE: 500, ICON_ROW_NAME_BASE: 600,
    ICON_ROW_DESC_BASE: 700, MAX_ROWS: 100, FOOTER_BUTTON: 900, FOOTER_BUTTON_LABEL: 901,
    SEARCH_BACKGROUND: 910, SEARCH_TEXT: 911,
    CONTROL_BACKGROUND_BASE: 920, CONTROL_LABEL_BASE: 930, MAX_CONTROLS: 8,
    MENU_BUTTON_BACKGROUND_BASE: 1000, MENU_BUTTON_ICON_BASE: 1040,
    MENU_BUTTON_LABEL_BASE: 1080, MAX_MENU_BUTTONS: 24,
    /** Client-local metadata and rows for cache interface component inspection. */
    PICKER_SOURCE: 1200, PICKER_ROW_PREVIEW_BASE: 2000,
    PICKER_ROW_LABEL_BASE: 2600, PICKER_ROW_ALT_PREVIEW_BASE: 3200,
    MAX_PICKER_ROWS: 500,
    /** Fixed thumbnail grid used by the dedicated full-cache sprite browser. */
    SPRITE_GALLERY_SOURCE: 1201, SPRITE_GALLERY_CELL_BASE: 4000,
    SPRITE_GALLERY_LABEL_BASE: 4100, MAX_SPRITE_GALLERY_CELLS: 48,
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
    /** 0 is opaque and 255 is fully transparent, matching WidgetNode. */
    transparency?: number;
};

/** One server-authoritative large button in a two-column menu grid. */
export type UiMenuButton = { itemId: number; label: string; transparency?: number };
export type UiPanelRow = UiTextRow | UiIconRow;

/** An intent only; the server must register and validate every action. */
export type UiActionId = string;

export type UiPanelLayout = {
    width: number; height: number;
    sidebar?: { width: number };
    /** Preferred spelling for new panels; sidebar remains backwards compatible. */
    tabs?: { position: UiTabPosition; width?: number; height?: number };
    content: { rowKind: UiRowKind; rowHeight: number; scrollbarWidth: number; rowCapacity?: number };
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
        /** Keeps a menu grid compact instead of letting it occupy the whole panel. */
        maxHeightFraction?: number;
        /** Limits the grid width and centres it within the content column. */
        maxWidthFraction?: number;
    };
};

export type UiTab = { label: string };
export type UiControl = { label: string };
