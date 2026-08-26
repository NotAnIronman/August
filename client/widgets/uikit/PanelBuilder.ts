import { FONT_BOLD_12, FONT_PLAIN_11, FONT_PLAIN_12 } from "../../ui/fonts";
import { FLAG_TRANSMIT_OP1 } from "../WidgetFlags";
import type { WidgetNode } from "../WidgetNode";
import { ComponentIds, type UiPanelLayout } from "../../common/uikit/contracts";

export type WidgetGroupLoadResult = {
    root: WidgetNode | undefined;
    widgets: Map<number, WidgetNode>;
};

const SIDEBAR_TOP = 36;
const TAB_HEIGHT = 22;
const CONTENT_TOP = 36;
const CONTENT_BOTTOM_MARGIN = 14;
const CONTENT_MARGIN_X = 16;

function panelWidgetUid(groupId: number, componentId: number): number {
    return ((groupId & 0xffff) << 16) | (componentId & 0xffff);
}

function makeWidget(
    groupId: number,
    componentId: number,
    parentUid: number,
    overrides: Partial<WidgetNode>,
): WidgetNode {
    const uid = panelWidgetUid(groupId, componentId);
    return {
        uid,
        id: uid,
        childIndex: -1,
        parentUid,
        groupId,
        fileId: componentId | 0,
        isIf3: true,
        type: 0,
        contentType: 0,
        rawX: 0,
        rawY: 0,
        rawWidth: 0,
        rawHeight: 0,
        widthMode: 0,
        heightMode: 0,
        xPositionMode: 0,
        yPositionMode: 0,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        scrollX: 0,
        scrollY: 0,
        scrollWidth: 0,
        scrollHeight: 0,
        isHidden: false,
        hidden: false,
        cachedHidden: false,
        rootIndex: -1,
        cycle: -1,
        modelFrame: 0,
        modelFrameCycle: 0,
        aspectWidth: 1,
        aspectHeight: 1,
        itemId: -1,
        itemQuantity: 0,
        ...overrides,
    };
}

/**
 * Builds a complete panel widget tree from a layout config:
 *   root -> frame (steelborder target, drawn server-side via
 *           SCRIPT_STEELBORDER - see server/gamemodes/vanilla/uikit/
 *           panelData.ts's openFramedPanel) + optional sidebar tabs +
 *           divider + a content area of rows (scrollable if there's a
 *           scrollbar column reserved).
 *
 * Every panel built with this function shares one component id scheme
 * (ComponentIds in types.ts), which is what lets a single generic scroll
 * controller and a single generic tab/row population helper work for
 * ANY panel, instead of each panel needing its own copy of that logic.
 */
/** Documented in server/src/widgets/viewport/index.ts as the mainmodal
 *  container's mobile size; every UIKit dev panel (720x570, 640x440,
 *  560x360) has overflowed its real container on desktop too, so this is
 *  applied everywhere as a working ceiling until the console diagnostic in
 *  WidgetManager.openSubInterface confirms the exact desktop number. */
const MAINMODAL_SAFE_WIDTH = 512;
const MAINMODAL_SAFE_HEIGHT = 334;

export function buildUiPanel(groupId: number, layout: UiPanelLayout): WidgetGroupLoadResult {
    if (!Number.isInteger(groupId) || groupId < 0) {
        throw new RangeError("UIKit panel groupId must be a non-negative integer");
    }
    if (layout.width <= 0 || layout.height <= 0 || layout.content.rowHeight <= 0) {
        throw new RangeError("UIKit panel dimensions and rowHeight must be positive");
    }
    if (layout.footerButton && layout.controls) {
        throw new Error("UIKit panels may use either footerButton or controls, not both");
    }
    // Clamped centrally so every panel built through this function is safe
    // by construction, instead of each panel guessing its own size and
    // getting clipped by the real mainmodal container one at a time.
    if (layout.width > MAINMODAL_SAFE_WIDTH || layout.height > MAINMODAL_SAFE_HEIGHT) {
        layout = {
            ...layout,
            width: Math.min(layout.width, MAINMODAL_SAFE_WIDTH),
            height: Math.min(layout.height, MAINMODAL_SAFE_HEIGHT),
        };
    }
    const widgets = new Map<number, WidgetNode>();
    const rootUid = panelWidgetUid(groupId, ComponentIds.ROOT);

    const root = makeWidget(groupId, ComponentIds.ROOT, -1, {
        type: 0,
        // Steelborder is a cache script that expects a full-modal host. The
        // visible border is produced inside this canvas-sized component.
        widthMode: 1,
        heightMode: 1,
        width: layout.width,
        height: layout.height,
        xPositionMode: 1,
        yPositionMode: 1,
        // UIKit modal panels capture pointer input by default, including
        // blank space and the steelborder close button.
        noClickThrough: layout.inputCapture !== false,
    });
    widgets.set(root.uid, root);

    // Frame is left as a plain, unfilled layer - SCRIPT_STEELBORDER paints
    // the border/backdrop/title bar/close button onto this component.
    const frame = makeWidget(groupId, ComponentIds.FRAME, rootUid, {
        type: layout.plainFrame ? 3 : 0,
        widthMode: 1,
        heightMode: 1,
        width: layout.width,
        height: layout.height,
        filled: layout.plainFrame ? true : undefined,
        color: layout.plainFrame ? 0x17130f : undefined,
    });
    widgets.set(frame.uid, frame);

    const tabPosition = layout.tabs?.position ?? (layout.sidebar ? "left" : undefined);
    const sidebarWidth =
        tabPosition === "left" ? (layout.tabs?.width ?? layout.sidebar?.width ?? 0) : 0;
    const tabsBottom = tabPosition === "top" ? CONTENT_TOP + (layout.tabs?.height ?? TAB_HEIGHT) + 4 : CONTENT_TOP;
    const contentTop = tabsBottom + (layout.search ? 30 : 0);

    if (tabPosition === "left") {
        const dividerX = sidebarWidth + 12;
        const centerLeftTabText = layout.tabs?.textAlignment === "center";
        const divider = makeWidget(groupId, ComponentIds.SIDEBAR_DIVIDER, rootUid, {
            type: 3,
            rawX: dividerX,
            rawY: SIDEBAR_TOP,
            rawWidth: 1,
            rawHeight: SIDEBAR_TOP,
            heightMode: 1,
            width: 1,
            height: layout.height - SIDEBAR_TOP - 14,
            filled: true,
            color: 0x5a5040,
        });
        widgets.set(divider.uid, divider);

        for (let i = 0; i < ComponentIds.MAX_TABS; i++) {
            const tabY = SIDEBAR_TOP + i * TAB_HEIGHT;
            const tabLeft = centerLeftTabText ? 8 : 16;
            const tabWidth = centerLeftTabText ? sidebarWidth - 4 : sidebarWidth - 16;

            // Highlight's component id is LOWER than the tab text's (see
            // the fileId z-order note in types.ts) so it draws behind,
            // not on top of, the label. The server only ever reveals this
            // widget for the currently-active tab (sendUiTabs in
            // panelData.ts), so backgroundHoverAsset - not backgroundAsset -
            // is what belongs here: it's already exactly the "this tab is
            // selected" signal, just swapping a sprite in for the plain
            // color instead of a persistent all-tabs background. A true
            // always-visible backgroundAsset needs its own widget below
            // TAB_BASE in the id space, which the current 3..12 range has
            // no room left for without shifting every id after it -
            // deliberately not doing that shift silently in the same patch
            // as everything else this round.
            const highlight = makeWidget(
                groupId,
                ComponentIds.TAB_HIGHLIGHT_BASE + i,
                rootUid,
                {
                    type: 3,
                    rawX: 8,
                    rawY: centerLeftTabText ? tabY : tabY - 2,
                    rawWidth: sidebarWidth - 4,
                    rawHeight: centerLeftTabText ? TAB_HEIGHT : TAB_HEIGHT - 2,
                    width: sidebarWidth - 4,
                    height: centerLeftTabText ? TAB_HEIGHT : TAB_HEIGHT - 2,
                    filled: true,
                    color: 0x3a2e1f,
                    cacheUiAsset: layout.tabs?.backgroundHoverAsset,
                    isHidden: true,
                    hidden: true,
                },
            );
            widgets.set(highlight.uid, highlight);

            const tab = makeWidget(groupId, ComponentIds.TAB_BASE + i, rootUid, {
                type: 4,
                rawX: tabLeft,
                rawY: tabY,
                rawWidth: tabWidth,
                rawHeight: TAB_HEIGHT,
                width: tabWidth,
                height: TAB_HEIGHT,
                text: "",
                fontId: FONT_BOLD_12,
                textColor: 0xff981f,
                mouseOverColor: 0xffffff,
                textShadowed: true,
                xTextAlignment: centerLeftTabText ? 1 : 0,
                yTextAlignment: 1,
                actions: ["Select"],
                flags: FLAG_TRANSMIT_OP1,
                isHidden: true,
                hidden: true,
            });
            widgets.set(tab.uid, tab);
        }
    } else if (tabPosition === "top") {
        const tabHeight = layout.tabs?.height ?? TAB_HEIGHT;
        const tabWidth = Math.max(1, Math.floor((layout.width - CONTENT_MARGIN_X * 2) / ComponentIds.MAX_TABS));
        for (let i = 0; i < ComponentIds.MAX_TABS; i++) {
            const tabX = CONTENT_MARGIN_X + i * tabWidth;
            const highlight = makeWidget(groupId, ComponentIds.TAB_HIGHLIGHT_BASE + i, rootUid, {
                type: 3, rawX: tabX, rawY: CONTENT_TOP - 2, rawWidth: tabWidth - 2,
                rawHeight: tabHeight, width: tabWidth - 2, height: tabHeight,
                filled: true, color: 0x3a2e1f,
                cacheUiAsset: layout.tabs?.backgroundHoverAsset,
                isHidden: true, hidden: true,
            });
            widgets.set(highlight.uid, highlight);
            const tab = makeWidget(groupId, ComponentIds.TAB_BASE + i, rootUid, {
                type: 4, rawX: tabX, rawY: CONTENT_TOP, rawWidth: tabWidth - 2,
                rawHeight: tabHeight, width: tabWidth - 2, height: tabHeight,
                text: "", fontId: FONT_BOLD_12, textColor: 0xff981f,
                mouseOverColor: 0xffffff, textShadowed: true, xTextAlignment: 1,
                yTextAlignment: 1, actions: ["Select"], flags: FLAG_TRANSMIT_OP1,
                isHidden: true, hidden: true,
            });
            widgets.set(tab.uid, tab);
        }
    }

    const contentLeft = tabPosition === "left" ? sidebarWidth + 12 + 16 : CONTENT_MARGIN_X;
    const infoColumnWidth = Math.max(0, layout.infoColumn?.width ?? 0);
    const infoColumnGap = infoColumnWidth > 0 ? Math.max(4, layout.infoColumn?.gap ?? 12) : 0;
    const contentWidth =
        layout.width - contentLeft - CONTENT_MARGIN_X - layout.content.scrollbarWidth -
        infoColumnWidth - infoColumnGap;
    // More bottom margin reserved when a footer button exists, so the
    // last content row doesn't render underneath it.
    const contentBottomMargin = layout.footerButton || layout.controls ? 36 : CONTENT_BOTTOM_MARGIN;
    const contentHeight = layout.height - contentTop - contentBottomMargin;
    const rowHeight = layout.content.rowHeight;

    const contentView = makeWidget(groupId, ComponentIds.CONTENT_VIEW, rootUid, {
        type: 0,
        rawX: contentLeft,
        rawY: contentTop,
        rawWidth: contentWidth,
        rawHeight: contentHeight,
        width: contentWidth,
        height: contentHeight,
        scrollX: 0,
        scrollY: 0,
        scrollWidth: contentWidth,
        scrollHeight: (layout.content.rowCapacity ?? ComponentIds.MAX_ROWS) * rowHeight,
        uikitScrollbar: layout.content.scrollbarWidth > 0,
    });
    widgets.set(contentView.uid, contentView);
    const contentViewUid = contentView.uid;

    if (infoColumnWidth > 0) {
        const infoLeft = contentLeft + contentWidth + layout.content.scrollbarWidth + infoColumnGap;
        const dividerX = infoLeft - Math.ceil(infoColumnGap / 2);
        const divider = makeWidget(groupId, ComponentIds.INFO_COLUMN_DIVIDER, rootUid, {
            type: 3,
            rawX: dividerX,
            rawY: contentTop,
            rawWidth: 1,
            rawHeight: contentHeight,
            width: 1,
            height: contentHeight,
            filled: true,
            color: 0x5a5040,
            isHidden: true,
            hidden: true,
        });
        widgets.set(divider.uid, divider);

        const infoRowHeight = Math.max(1, layout.infoColumn?.rowHeight ?? rowHeight);
        const infoRowCapacity = Math.max(
            0,
            Math.min(
                ComponentIds.MAX_INFO_COLUMN_ROWS,
                layout.infoColumn?.rowCapacity ?? ComponentIds.MAX_INFO_COLUMN_ROWS,
            ),
        );
        for (let i = 0; i < infoRowCapacity; i++) {
            const line = makeWidget(groupId, ComponentIds.INFO_COLUMN_ROW_BASE + i, rootUid, {
                type: 4,
                rawX: infoLeft,
                rawY: contentTop + i * infoRowHeight,
                rawWidth: infoColumnWidth,
                rawHeight: infoRowHeight,
                width: infoColumnWidth,
                height: infoRowHeight,
                text: "",
                fontId: FONT_PLAIN_12,
                textColor: 0xe8ded0,
                textShadowed: true,
                xTextAlignment: 0,
                yTextAlignment: 1,
                isHidden: true,
                hidden: true,
            });
            widgets.set(line.uid, line);
        }
    }

    if (layout.search) {
        // Steelborder owns the outermost pixels of a modal. Keep UIKit input
        // controls inset from that border even when callers request a wide field.
        const searchInset = 10;
        const searchWidth = Math.min(
            Math.max(80, layout.search.width ?? Math.floor(contentWidth / 2)),
            Math.max(80, contentWidth - searchInset * 2),
        );
        const searchY = tabsBottom + 4;
        const background = makeWidget(groupId, ComponentIds.SEARCH_BACKGROUND, rootUid, {
            type: 3, rawX: contentLeft + searchInset, rawY: searchY, rawWidth: searchWidth,
            rawHeight: 22, width: searchWidth, height: 22, filled: true,
            color: 0x2b241b, mouseOverColor: 0x342b20,
        });
        const text = makeWidget(groupId, ComponentIds.SEARCH_TEXT, rootUid, {
            type: 4, rawX: contentLeft + searchInset + 6, rawY: searchY, rawWidth: searchWidth - 12,
            rawHeight: 22, width: searchWidth - 12, height: 22,
            text: `<col=8f7f66>${layout.search.placeholder}</col>`, fontId: FONT_PLAIN_12,
            textColor: 0xe8ded0, textShadowed: true, xTextAlignment: 0, yTextAlignment: 1,
            actions: ["Search"], flags: FLAG_TRANSMIT_OP1,
        });
        widgets.set(background.uid, background);
        widgets.set(text.uid, text);
    }

    const includesTextRows = layout.content.rowKind === "text" || layout.content.rowKind === "mixed";
    const includesIconRows = layout.content.rowKind === "icon" || layout.content.rowKind === "mixed";
    const includesPickerRows = layout.content.rowKind === "picker";
    const includesSpriteGallery = layout.content.rowKind === "sprite-gallery";

    const inlineRowActionsWidth = 54; // 3 icons (14px) + gaps + margin — see below
    if (includesTextRows) {
        for (let i = 0; i < ComponentIds.MAX_ROWS; i++) {
            const rawY = i * rowHeight;
            const hasInlineActions = layout.content.inlineRowActions && i < ComponentIds.INLINE_ROW_ACTION_CAPACITY;
            const lineWidth = hasInlineActions ? Math.max(1, contentWidth - inlineRowActionsWidth) : contentWidth;
            const line = makeWidget(
                groupId,
                ComponentIds.TEXT_ROW_LINE_BASE + i,
                contentViewUid,
                {
                    type: 4,
                    rawX: 0,
                    rawY,
                    // Absolute width (not the stretch-mode 0/widthMode:1
                    // used otherwise) specifically when this row needs to
                    // leave room for its own inline buttons - a fresh
                    // custom widget, not an override of an existing native
                    // one, so no separate mode-reset trick is needed here.
                    rawWidth: hasInlineActions ? lineWidth : 0,
                    rawHeight: rowHeight,
                    widthMode: hasInlineActions ? 0 : 1,
                    width: lineWidth,
                    height: rowHeight,
                    text: "",
                    fontId: FONT_PLAIN_12,
                    textColor: 0xe8ded0,
                    textShadowed: true,
                    xTextAlignment: 0,
                    yTextAlignment: 1,
                    isHidden: true,
                    hidden: true,
                },
            );
            widgets.set(line.uid, line);

            const divider = makeWidget(
                groupId,
                ComponentIds.TEXT_ROW_DIVIDER_BASE + i,
                contentViewUid,
                {
                    type: 3,
                    rawX: 0,
                    rawY: rawY + Math.floor(rowHeight / 2) - 1,
                    rawWidth: 0,
                    rawHeight: 1,
                    widthMode: 1,
                    width: contentWidth,
                    height: 1,
                    filled: true,
                    color: 0x5a5040,
                    isHidden: true,
                    hidden: true,
                },
            );
            widgets.set(divider.uid, divider);

            const centered = makeWidget(
                groupId,
                ComponentIds.TEXT_ROW_CENTER_BASE + i,
                contentViewUid,
                {
                    type: 4,
                    rawX: 0,
                    rawY,
                    rawWidth: 0,
                    rawHeight: rowHeight,
                    widthMode: 1,
                    width: contentWidth,
                    height: rowHeight,
                    text: "",
                    fontId: FONT_PLAIN_12,
                    textColor: 0xe8ded0,
                    textShadowed: true,
                    xTextAlignment: 1,
                    yTextAlignment: 1,
                    isHidden: true,
                    hidden: true,
                },
            );
            widgets.set(centered.uid, centered);

            if (layout.content.clickableRows) {
                // Invisible full-row click/right-click target, decoupled
                // from the text widget's own tight bounds (a short line
                // like "1.) hi" would otherwise leave most of the row
                // unclickable) - same rationale as SPRITE_GALLERY_HITZONE.
                // Shrunk to lineWidth when this row also has inline action
                // buttons, so a click on one of those doesn't also overlap
                // the row-select hit-zone underneath it.
                const hitZone = makeWidget(
                    groupId,
                    ComponentIds.DIALOGUE_ROW_HITZONE_BASE + i,
                    contentViewUid,
                    {
                        type: 3,
                        rawX: 0,
                        rawY,
                        rawWidth: hasInlineActions ? lineWidth : 0,
                        rawHeight: rowHeight,
                        widthMode: hasInlineActions ? 0 : 1,
                        width: lineWidth,
                        height: rowHeight,
                        filled: false,
                        isHidden: true,
                        hidden: true,
                    },
                );
                widgets.set(hitZone.uid, hitZone);
            }

            if (hasInlineActions) {
                // Real clickable icon widgets (own actions/FLAG_TRANSMIT_OP1,
                // no separate background rect - same server-round-trip click
                // mechanism CONTROL_BACKGROUND_BASE already uses, just one
                // widget per button instead of a background+icon pair, to
                // keep 3-per-row x 40 rows from doubling to 240 widgets for
                // a purely cosmetic hover tint this scale doesn't need).
                const iconSize = 14;
                const gap = 2;
                const startX = lineWidth + 4;
                const iconY = rawY + Math.floor((rowHeight - iconSize) / 2);
                const buttons: Array<[number, string]> = [
                    [ComponentIds.ROW_MOVE_UP_BASE + i, "Move up"],
                    [ComponentIds.ROW_MOVE_DOWN_BASE + i, "Move down"],
                    [ComponentIds.ROW_DELETE_BASE + i, "Delete"],
                ];
                buttons.forEach(([componentId, actionLabel], slot) => {
                    const icon = makeWidget(groupId, componentId, contentViewUid, {
                        type: 5,
                        rawX: startX + slot * (iconSize + gap),
                        rawY: iconY,
                        rawWidth: iconSize,
                        rawHeight: iconSize,
                        widthMode: 0,
                        width: iconSize,
                        height: iconSize,
                        itemId: -1,
                        actions: [actionLabel],
                        flags: FLAG_TRANSMIT_OP1,
                        isHidden: true,
                        hidden: true,
                    });
                    widgets.set(icon.uid, icon);
                });
            }
        }

        if (layout.content.clickableRows) {
            // Single hidden-state signal widget (not per-row) - see
            // DIALOGUE_ACTIVATE_SIGNAL's doc comment in contracts.ts.
            // Position/size don't matter since it's never actually shown;
            // parented to rootUid (not contentViewUid) so it isn't affected
            // by content scrolling.
            const activateSignal = makeWidget(
                groupId,
                ComponentIds.DIALOGUE_ACTIVATE_SIGNAL,
                rootUid,
                { type: 3, rawX: 0, rawY: 0, rawWidth: 1, rawHeight: 1, filled: false, isHidden: true, hidden: true },
            );
            widgets.set(activateSignal.uid, activateSignal);
        }
    }

    if (includesIconRows) {
        const levelWidth = 26;
        const levelHeight = 26;
        const iconSize = 32;
        const iconTop = 2;
        const alternatingRowConfig = layout.content.iconRowAlternateBackground;
        const centerNameWithoutDescription = layout.content.iconRowCenterNameWithoutDescription === true;
        const iconRowNameHeight = Math.max(
            1,
            Math.min(rowHeight, layout.content.iconRowNameHeight ?? 16),
        );
        const iconRowDescriptionHeight = Math.max(
            1,
            Math.min(
                Math.max(1, rowHeight - iconRowNameHeight),
                layout.content.iconRowDescriptionHeight ?? 16,
            ),
        );
        const iconRowDescriptionYAlignment = iconRowDescriptionHeight > 16 ? 0 : 1;
        const iconRowBackgroundLayerUid = alternatingRowConfig
            ? panelWidgetUid(groupId, ComponentIds.ICON_ROW_BACKGROUND_LAYER)
            : undefined;
        if (alternatingRowConfig) {
            const backgroundLayer = makeWidget(
                groupId,
                ComponentIds.ICON_ROW_BACKGROUND_LAYER,
                contentViewUid,
                {
                    type: 0,
                    rawX: 0,
                    rawY: 0,
                    rawWidth: contentWidth,
                    rawHeight: (layout.content.rowCapacity ?? ComponentIds.MAX_ROWS) * rowHeight,
                    width: contentWidth,
                    height: (layout.content.rowCapacity ?? ComponentIds.MAX_ROWS) * rowHeight,
                    scrollWidth: contentWidth,
                    scrollHeight: (layout.content.rowCapacity ?? ComponentIds.MAX_ROWS) * rowHeight,
                },
            );
            widgets.set(backgroundLayer.uid, backgroundLayer);
        }
        for (let i = 0; i < ComponentIds.MAX_ROWS; i++) {
            const rawY = i * rowHeight;

            if (iconRowBackgroundLayerUid !== undefined) {
                const config = alternatingRowConfig === true ? {} : alternatingRowConfig;
                const background = makeWidget(
                    groupId,
                    ComponentIds.ICON_ROW_BACKGROUND_BASE + i,
                    iconRowBackgroundLayerUid,
                    {
                        type: 3,
                        rawX: 0,
                        rawY,
                        rawWidth: contentWidth,
                        rawHeight: rowHeight,
                        width: contentWidth,
                        height: rowHeight,
                        filled: true,
                        // A muted overlay keeps the cache panel texture
                        // visible, matching the main game's subtle stripes.
                        color: config.color ?? 0x504a40,
                        transparency: config.transparency ?? 132,
                        isHidden: true,
                        hidden: true,
                    },
                );
                widgets.set(background.uid, background);
            }

            const level = makeWidget(
                groupId,
                ComponentIds.ICON_ROW_LEVEL_BASE + i,
                contentViewUid,
                {
                    type: 4,
                    rawX: 0,
                    rawY: rawY + iconTop + Math.floor((iconSize - levelHeight) / 2),
                    rawWidth: levelWidth,
                    rawHeight: levelHeight,
                    width: levelWidth,
                    height: levelHeight,
                    text: "",
                    fontId: FONT_PLAIN_12,
                    textColor: 0xc5b79b,
                    textShadowed: true,
                    xTextAlignment: 1,
                    yTextAlignment: 1,
                    isHidden: true,
                    hidden: true,
                },
            );
            widgets.set(level.uid, level);

            const icon = makeWidget(
                groupId,
                ComponentIds.ICON_ROW_ICON_BASE + i,
                contentViewUid,
                {
                    type: 5,
                    rawX: levelWidth + 6,
                    rawY: rawY + iconTop,
                    rawWidth: iconSize,
                    rawHeight: iconSize,
                    width: iconSize,
                    height: iconSize,
                    itemId: -1,
                    itemQuantity: 1,
                    isHidden: true,
                    hidden: true,
                },
            );
            widgets.set(icon.uid, icon);

            const nameLeft = levelWidth + 6 + iconSize + 10;
            const name = makeWidget(
                groupId,
                ComponentIds.ICON_ROW_NAME_BASE + i,
                contentViewUid,
                {
                    type: 4,
                    rawX: nameLeft,
                    rawY,
                    rawWidth: nameLeft,
                    rawHeight: iconRowNameHeight,
                    widthMode: 1,
                    width: contentWidth - nameLeft,
                    height: iconRowNameHeight,
                    text: "",
                    fontId: FONT_PLAIN_12,
                    textColor: 0xe8ded0,
                    textShadowed: true,
                    xTextAlignment: 0,
                    yTextAlignment: 1,
                    isHidden: true,
                    hidden: true,
                },
            );
            widgets.set(name.uid, name);

            if (centerNameWithoutDescription) {
                const centeredName = makeWidget(
                    groupId,
                    ComponentIds.ICON_ROW_CENTERED_NAME_BASE + i,
                    contentViewUid,
                    {
                        type: 4,
                        rawX: nameLeft,
                        rawY,
                        rawWidth: nameLeft,
                        rawHeight: rowHeight,
                        widthMode: 1,
                        width: contentWidth - nameLeft,
                        height: rowHeight,
                        text: "",
                        fontId: FONT_PLAIN_12,
                        textColor: 0xe8ded0,
                        textShadowed: true,
                        xTextAlignment: 0,
                        yTextAlignment: 1,
                        isHidden: true,
                        hidden: true,
                    },
                );
                widgets.set(centeredName.uid, centeredName);
            }

            const desc = makeWidget(
                groupId,
                ComponentIds.ICON_ROW_DESC_BASE + i,
                contentViewUid,
                {
                    type: 4,
                    rawX: nameLeft,
                    rawY: rawY + iconRowNameHeight,
                    rawWidth: nameLeft,
                    rawHeight: iconRowDescriptionHeight,
                    widthMode: 1,
                    width: contentWidth - nameLeft,
                    height: iconRowDescriptionHeight,
                    text: "",
                    fontId: FONT_PLAIN_12,
                    textColor: 0xa89a80,
                    textShadowed: true,
                    xTextAlignment: 0,
                    // A tall secondary field is reserved for wrapped text;
                    // top-align it so a one-line requirement sits directly
                    // beneath the row name instead of floating in the middle.
                    yTextAlignment: iconRowDescriptionYAlignment,
                    isHidden: true,
                    hidden: true,
                },
            );
            widgets.set(desc.uid, desc);
        }
    }

    if (layout.menuButtons) {
        const columns = layout.menuButtons.columns ?? 2;
        const gap = layout.menuButtons.gap ?? 8;
        const rows = Math.max(1, layout.menuButtons.rows ?? 4);
        const requestedButtonHeight = layout.menuButtons.buttonHeight ?? 52;
        const maxHeightFraction = Math.min(
            1,
            Math.max(0.1, layout.menuButtons.maxHeightFraction ?? 0.5),
        );
        const gridHeight = Math.max(20, Math.floor(contentHeight * maxHeightFraction));
        const maxWidthFraction = Math.min(
            1,
            Math.max(0.1, layout.menuButtons.maxWidthFraction ?? 1),
        );
        const gridWidth = Math.max(1, Math.floor(contentWidth * maxWidthFraction));
        const gridOffsetX = Math.floor((contentWidth - gridWidth) / 2);
        // Keep the declared menu grid within the content viewport. Extra
        // button slots are hidden by the server until populated. A compact
        // grid also prevents menu buttons from visually swallowing a modal.
        const buttonHeight = Math.max(
            20,
            Math.min(
                requestedButtonHeight,
                Math.floor((gridHeight - gap * (rows - 1)) / rows),
            ),
        );
        const iconSize = Math.max(12, Math.min(layout.menuButtons.iconSize ?? 36, buttonHeight - 12));
        const buttonWidth = Math.max(1, Math.floor((gridWidth - gap * (columns - 1)) / columns));
        for (let i = 0; i < ComponentIds.MAX_MENU_BUTTONS; i++) {
            const column = i % columns;
            const row = Math.floor(i / columns);
            const button = makeWidget(groupId, ComponentIds.MENU_BUTTON_BACKGROUND_BASE + i, contentViewUid, {
                type: 3,
                rawX: gridOffsetX + column * (buttonWidth + gap), rawY: row * (buttonHeight + gap),
                rawWidth: buttonWidth, rawHeight: buttonHeight, width: buttonWidth, height: buttonHeight,
                filled: true, color: 0x241e16, mouseOverColor: 0x3a3022, opacity: 104,
                cacheUiAsset: layout.menuButtons.backgroundAsset,
                cacheUiAssetHover: layout.menuButtons.backgroundHoverAsset,
                actions: ["Select"], flags: FLAG_TRANSMIT_OP1, isHidden: true, hidden: true,
            });
            widgets.set(button.uid, button);
            const icon = makeWidget(groupId, ComponentIds.MENU_BUTTON_ICON_BASE + i, contentViewUid, {
                // Rectangle widgets do not traverse static children, so item
                // icons and labels must be siblings inside the content view.
                type: 5,
                rawX: gridOffsetX + column * (buttonWidth + gap) + 8,
                rawY: row * (buttonHeight + gap) + Math.max(0, Math.floor((buttonHeight - iconSize) / 2)),
                rawWidth: iconSize, rawHeight: iconSize, width: iconSize, height: iconSize,
                itemId: -1, itemQuantity: 1,
            });
            widgets.set(icon.uid, icon);
            const label = makeWidget(groupId, ComponentIds.MENU_BUTTON_LABEL_BASE + i, contentViewUid, {
                type: 4,
                rawX: gridOffsetX + column * (buttonWidth + gap) + iconSize + 16,
                rawY: row * (buttonHeight + gap),
                rawWidth: buttonWidth - iconSize - 22, rawHeight: buttonHeight,
                width: buttonWidth - iconSize - 22, height: buttonHeight,
                text: "", fontId: FONT_BOLD_12, textColor: 0xffd27f, textShadowed: true,
                xTextAlignment: 0, yTextAlignment: 1,
            });
            widgets.set(label.uid, label);
        }
    }

    if (includesPickerRows) {
        const rowCapacity = layout.content.rowCapacity ?? ComponentIds.MAX_PICKER_ROWS;
        for (let i = 0; i < rowCapacity; i++) {
            const rawY = i * rowHeight;
            const preview = makeWidget(groupId, ComponentIds.PICKER_ROW_PREVIEW_BASE + i, contentViewUid, {
                type: 5, rawX: 2, rawY: rawY + 2, rawWidth: 28, rawHeight: 28,
                width: 28, height: 28, itemId: -1, itemQuantity: 1, isHidden: true, hidden: true,
            });
            const alternatePreview = makeWidget(
                groupId,
                ComponentIds.PICKER_ROW_ALT_PREVIEW_BASE + i,
                contentViewUid,
                {
                    type: 5, rawX: 34, rawY: rawY + 2, rawWidth: 28, rawHeight: 28,
                    width: 28, height: 28, itemId: -1, itemQuantity: 1, isHidden: true, hidden: true,
                },
            );
            const label = makeWidget(groupId, ComponentIds.PICKER_ROW_LABEL_BASE + i, contentViewUid, {
                type: 4, rawX: 70, rawY, rawWidth: 70, rawHeight: rowHeight,
                widthMode: 1, width: contentWidth - 70, height: rowHeight, text: "",
                fontId: FONT_PLAIN_11, textColor: 0xe8ded0, textShadowed: true,
                xTextAlignment: 0, yTextAlignment: 1, isHidden: true, hidden: true,
            });
            widgets.set(preview.uid, preview);
            widgets.set(alternatePreview.uid, alternatePreview);
            widgets.set(label.uid, label);
        }
        // The server sets this hidden text widget to the selected cache group.
        const source = makeWidget(groupId, ComponentIds.PICKER_SOURCE, rootUid, {
            type: 4, rawWidth: 1, rawHeight: 1, width: 1, height: 1,
            text: "", isHidden: true, hidden: true,
        });
        widgets.set(source.uid, source);
    }

    if (includesSpriteGallery) {
        // 8x6 fits comfortably inside the 512x334 mainmodal ceiling even
        // with the search bar's 30px eating into contentHeight - verified
        // by the same fits-by-construction math as before (columns*cellWidth
        // + gaps <= contentWidth, rows*cellHeight <= contentHeight).
        const columns = 8;
        const rows = Math.ceil(ComponentIds.MAX_SPRITE_GALLERY_CELLS / columns);
        const gap = 8;
        // cellWidth/cellHeight are an exact fit for the content area (no
        // minimum-size floor). A previous version clamped cellHeight to a
        // 48px minimum, which - once the last row's rawY + cellHeight is
        // computed - could sit past contentHeight and render the bottom row
        // of sprites outside the panel. Correctness (fits in the window)
        // takes priority over a cosmetic minimum cell size.
        const cellWidth = Math.max(1, Math.floor((contentWidth - gap * (columns - 1)) / columns));
        const cellHeight = Math.max(1, Math.floor(contentHeight / rows));
        // The label gets a guaranteed share of the cell first, and the
        // preview gets what's left, so preview + label can never together
        // exceed cellHeight - independent per-part minimums (the previous
        // approach) could each grow past their share of a small cell.
        const labelHeight = Math.max(1, Math.floor(cellHeight * 0.22));
        const previewMaxWidth = Math.max(1, cellWidth - 8);
        const previewMaxHeight = Math.min(42, Math.max(1, cellHeight - labelHeight));
        for (let i = 0; i < ComponentIds.MAX_SPRITE_GALLERY_CELLS; i++) {
            const column = i % columns;
            const row = Math.floor(i / columns);
            const rawX = column * (cellWidth + gap);
            const rawY = row * cellHeight;
            const preview = makeWidget(groupId, ComponentIds.SPRITE_GALLERY_CELL_BASE + i, contentViewUid, {
                type: 5,
                rawX: rawX + Math.floor((cellWidth - previewMaxWidth) / 2),
                rawY,
                rawWidth: previewMaxWidth,
                rawHeight: previewMaxHeight,
                width: previewMaxWidth,
                height: previewMaxHeight,
                itemId: -1,
                itemQuantity: 1,
                isHidden: true,
                hidden: true,
            });
            // Retained as local presentation metadata so later gallery pages
            // can fit each sprite without stretching it.
            (preview as any).__uikitGalleryMaxWidth = previewMaxWidth;
            (preview as any).__uikitGalleryMaxHeight = previewMaxHeight;
            (preview as any).__uikitGalleryCenterX = rawX + Math.floor(cellWidth / 2);
            (preview as any).__uikitGalleryTopY = rawY;
            const label = makeWidget(groupId, ComponentIds.SPRITE_GALLERY_LABEL_BASE + i, contentViewUid, {
                type: 4,
                rawX,
                rawY: rawY + previewMaxHeight,
                rawWidth: cellWidth,
                rawHeight: cellHeight - previewMaxHeight,
                width: cellWidth,
                height: cellHeight - previewMaxHeight,
                text: "",
                fontId: FONT_PLAIN_11,
                textColor: 0xe8ded0,
                textShadowed: true,
                xTextAlignment: 1,
                yTextAlignment: 1,
                isHidden: true,
                hidden: true,
            });
            widgets.set(preview.uid, preview);
            widgets.set(label.uid, label);
            // Full-cell invisible hit zone (see ComponentIds.SPRITE_GALLERY_
            // HITZONE_BASE) - covers the whole grid slot, not just the
            // aspect-fit sprite's own tighter bounds, so clicking anywhere
            // in a cell (including the padding around a small/narrow icon)
            // reliably hits it.
            const hitZone = makeWidget(groupId, ComponentIds.SPRITE_GALLERY_HITZONE_BASE + i, contentViewUid, {
                type: 3,
                rawX, rawY, rawWidth: cellWidth, rawHeight: cellHeight,
                width: cellWidth, height: cellHeight,
                filled: false,
                isHidden: true, hidden: true,
            });
            widgets.set(hitZone.uid, hitZone);
        }
        const source = makeWidget(groupId, ComponentIds.SPRITE_GALLERY_SOURCE, rootUid, {
            type: 4, rawWidth: 1, rawHeight: 1, width: 1, height: 1,
            text: "", isHidden: true, hidden: true,
        });
        widgets.set(source.uid, source);
        const filter = makeWidget(groupId, ComponentIds.SPRITE_GALLERY_FILTER, rootUid, {
            type: 4, rawWidth: 1, rawHeight: 1, width: 1, height: 1,
            text: "all", isHidden: true, hidden: true,
        });
        widgets.set(filter.uid, filter);
    }

    if (layout.footerButton) {
        const footerButton = makeWidget(groupId, ComponentIds.FOOTER_BUTTON, rootUid, {
            type: 3,
            rawX: 0,
            rawY: 10,
            rawWidth: 140,
            rawHeight: 20,
            xPositionMode: 1,
            yPositionMode: 2,
            width: 140,
            height: 20,
            filled: true,
            color: 0x241e16,
            mouseOverColor: 0x3a3022,
            opacity: 104,
            actions: ["View"],
            flags: FLAG_TRANSMIT_OP1,
        });
        widgets.set(footerButton.uid, footerButton);
        // Rectangle widgets cannot render text or traverse static children.
        // Render the label as a sibling and mirror visibility server-side.
        const footerLabel = makeWidget(groupId, ComponentIds.FOOTER_BUTTON_LABEL, rootUid, {
            type: 4,
            rawX: 0,
            rawY: 10,
            rawWidth: 140,
            rawHeight: 20,
            xPositionMode: 1,
            yPositionMode: 2,
            width: 140,
            height: 20,
            text: "",
            fontId: FONT_BOLD_12,
            textColor: 0xffd27f,
            textShadowed: true,
            xTextAlignment: 1,
            yTextAlignment: 1,
        });
        widgets.set(footerLabel.uid, footerLabel);
    }

    if (layout.controls) {
        const controlCount = Math.max(
            1,
            Math.min(ComponentIds.MAX_CONTROLS, layout.controls.count ?? ComponentIds.MAX_CONTROLS),
        );
        const controlGap = layout.controls.gap ?? 6;
        const maxControlWidth = Math.max(
            1,
            Math.floor((layout.width - CONTENT_MARGIN_X * 2 - controlGap * (controlCount - 1)) /
                controlCount),
        );
        const controlWidth = Math.min(layout.controls.width ?? 92, maxControlWidth);
        const controlHeight = layout.controls.height ?? 20;
        const totalWidth = controlCount * controlWidth + (controlCount - 1) * controlGap;
        const firstX = Math.max(CONTENT_MARGIN_X, Math.floor((layout.width - totalWidth) / 2));
        // Icon sits at the left of the button, caption fills the rest -
        // side by side, not stacked, since the button is too short to
        // stack them. sendUiControls hides whichever of the two a given
        // control doesn't provide, so icon-only and label-only buttons
        // both still work; this just also allows both at once.
        const iconSize = Math.max(10, Math.min(controlHeight - 6, 18));
        for (let i = 0; i < controlCount; i++) {
            const x = firstX + i * (controlWidth + controlGap);
            const background = makeWidget(groupId, ComponentIds.CONTROL_BACKGROUND_BASE + i, rootUid, {
                type: 3, rawX: x, rawY: 10, rawWidth: controlWidth, rawHeight: controlHeight,
                yPositionMode: 2, width: controlWidth, height: controlHeight, filled: true,
                color: 0x241e16, mouseOverColor: 0x3a3022, opacity: 104,
                actions: ["Select"], flags: FLAG_TRANSMIT_OP1, isHidden: true, hidden: true,
            });
            widgets.set(background.uid, background);

            const icon = makeWidget(groupId, ComponentIds.CONTROL_ICON_BASE + i, rootUid, {
                type: 5,
                rawX: x + 4,
                rawY: 10 + Math.floor((controlHeight - iconSize) / 2),
                rawWidth: iconSize, rawHeight: iconSize,
                yPositionMode: 2, width: iconSize, height: iconSize,
                itemId: -1, itemQuantity: 1, isHidden: true, hidden: true,
            });
            widgets.set(icon.uid, icon);

            // Label starts after the icon slot regardless of whether this
            // particular control actually has an icon, so a label-only
            // control (icon hidden) still lines up the same as one with
            // both - text position doesn't jump around per-control.
            const labelX = x + iconSize + 8;
            const labelWidth = Math.max(1, controlWidth - iconSize - 12);
            const label = makeWidget(groupId, ComponentIds.CONTROL_LABEL_BASE + i, rootUid, {
                type: 4, rawX: labelX, rawY: 10, rawWidth: labelWidth, rawHeight: controlHeight,
                yPositionMode: 2, width: labelWidth, height: controlHeight, text: "",
                fontId: FONT_PLAIN_11, textColor: 0xffd27f, textShadowed: true,
                xTextAlignment: 0, yTextAlignment: 1, isHidden: true, hidden: true,
            });
            widgets.set(label.uid, label);
        }
    }

    return { root, widgets };
}
