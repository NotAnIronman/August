import { FONT_BOLD_12, FONT_PLAIN_11, FONT_PLAIN_12 } from "../../ui/fonts";
import { FLAG_TRANSMIT_OP1 } from "../WidgetFlags";
import type { WidgetNode } from "../WidgetNode";
import { ComponentIds, type UiPanelLayout } from "./types";

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
    const widgets = new Map<number, WidgetNode>();
    const rootUid = panelWidgetUid(groupId, ComponentIds.ROOT);

    const root = makeWidget(groupId, ComponentIds.ROOT, -1, {
        type: 0,
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

            // Highlight's component id is LOWER than the tab text's (see
            // the fileId z-order note in types.ts) so it draws behind,
            // not on top of, the label.
            const highlight = makeWidget(
                groupId,
                ComponentIds.TAB_HIGHLIGHT_BASE + i,
                rootUid,
                {
                    type: 3,
                    rawX: 8,
                    rawY: tabY - 2,
                    rawWidth: sidebarWidth - 4,
                    rawHeight: TAB_HEIGHT - 2,
                    width: sidebarWidth - 4,
                    height: TAB_HEIGHT - 2,
                    filled: true,
                    color: 0x3a2e1f,
                    isHidden: true,
                    hidden: true,
                },
            );
            widgets.set(highlight.uid, highlight);

            const tab = makeWidget(groupId, ComponentIds.TAB_BASE + i, rootUid, {
                type: 4,
                rawX: 16,
                rawY: tabY,
                rawWidth: sidebarWidth - 16,
                rawHeight: TAB_HEIGHT,
                width: sidebarWidth - 16,
                height: TAB_HEIGHT,
                text: "",
                fontId: FONT_BOLD_12,
                textColor: 0xff981f,
                mouseOverColor: 0xffffff,
                textShadowed: true,
                xTextAlignment: 0,
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
                filled: true, color: 0x3a2e1f, isHidden: true, hidden: true,
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
    const contentWidth =
        layout.width - contentLeft - CONTENT_MARGIN_X - layout.content.scrollbarWidth;
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
    });
    widgets.set(contentView.uid, contentView);
    const contentViewUid = contentView.uid;

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

    if (includesTextRows) {
        for (let i = 0; i < ComponentIds.MAX_ROWS; i++) {
            const rawY = i * rowHeight;
            const line = makeWidget(
                groupId,
                ComponentIds.TEXT_ROW_LINE_BASE + i,
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
        }
    }

    if (includesIconRows) {
        const levelWidth = 26;
        const iconSize = 26;
        for (let i = 0; i < ComponentIds.MAX_ROWS; i++) {
            const rawY = i * rowHeight;

            const level = makeWidget(
                groupId,
                ComponentIds.ICON_ROW_LEVEL_BASE + i,
                contentViewUid,
                {
                    type: 4,
                    rawX: 0,
                    rawY: rawY + 2,
                    rawWidth: levelWidth,
                    rawHeight: iconSize,
                    width: levelWidth,
                    height: iconSize,
                    text: "",
                    fontId: FONT_PLAIN_11,
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
                    rawY: rawY + 2,
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
                    rawHeight: 16,
                    widthMode: 1,
                    width: contentWidth - nameLeft,
                    height: 16,
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

            const desc = makeWidget(
                groupId,
                ComponentIds.ICON_ROW_DESC_BASE + i,
                contentViewUid,
                {
                    type: 4,
                    rawX: nameLeft,
                    rawY: rawY + 16,
                    rawWidth: nameLeft,
                    rawHeight: 16,
                    widthMode: 1,
                    width: contentWidth - nameLeft,
                    height: 16,
                    text: "",
                    fontId: FONT_PLAIN_11,
                    textColor: 0xa89a80,
                    textShadowed: true,
                    xTextAlignment: 0,
                    yTextAlignment: 1,
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
        const buttonWidth = Math.max(1, Math.floor((contentWidth - gap * (columns - 1)) / columns));
        for (let i = 0; i < ComponentIds.MAX_MENU_BUTTONS; i++) {
            const column = i % columns;
            const row = Math.floor(i / columns);
            const button = makeWidget(groupId, ComponentIds.MENU_BUTTON_BACKGROUND_BASE + i, contentViewUid, {
                type: 3,
                rawX: column * (buttonWidth + gap), rawY: row * (buttonHeight + gap),
                rawWidth: buttonWidth, rawHeight: buttonHeight, width: buttonWidth, height: buttonHeight,
                filled: true, color: 0x241e16, mouseOverColor: 0x3a3022, opacity: 104,
                actions: ["Select"], flags: FLAG_TRANSMIT_OP1, isHidden: true, hidden: true,
            });
            widgets.set(button.uid, button);
            const icon = makeWidget(groupId, ComponentIds.MENU_BUTTON_ICON_BASE + i, contentViewUid, {
                // Rectangle widgets do not traverse static children, so item
                // icons and labels must be siblings inside the content view.
                type: 5,
                rawX: column * (buttonWidth + gap) + 8,
                rawY: row * (buttonHeight + gap) + Math.max(0, Math.floor((buttonHeight - iconSize) / 2)),
                rawWidth: iconSize, rawHeight: iconSize, width: iconSize, height: iconSize,
                itemId: -1, itemQuantity: 1,
            });
            widgets.set(icon.uid, icon);
            const label = makeWidget(groupId, ComponentIds.MENU_BUTTON_LABEL_BASE + i, contentViewUid, {
                type: 4,
                rawX: column * (buttonWidth + gap) + iconSize + 16,
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
            const label = makeWidget(groupId, ComponentIds.PICKER_ROW_LABEL_BASE + i, contentViewUid, {
                type: 4, rawX: 38, rawY, rawWidth: 38, rawHeight: rowHeight,
                widthMode: 1, width: contentWidth - 38, height: rowHeight, text: "",
                fontId: FONT_PLAIN_11, textColor: 0xe8ded0, textShadowed: true,
                xTextAlignment: 0, yTextAlignment: 1, isHidden: true, hidden: true,
            });
            widgets.set(preview.uid, preview);
            widgets.set(label.uid, label);
        }
        // The server sets this hidden text widget to the selected cache group.
        const source = makeWidget(groupId, ComponentIds.PICKER_SOURCE, rootUid, {
            type: 4, rawWidth: 1, rawHeight: 1, width: 1, height: 1,
            text: "", isHidden: true, hidden: true,
        });
        widgets.set(source.uid, source);
    }

    if (layout.content.scrollbarWidth > 0) {
        const scrollbarX = layout.width - layout.content.scrollbarWidth - 12;
        const scrollbar = makeWidget(groupId, ComponentIds.SCROLLBAR, rootUid, {
            type: 0,
            rawX: scrollbarX,
            rawY: contentTop,
            rawWidth: layout.content.scrollbarWidth,
            rawHeight: contentHeight,
            width: layout.content.scrollbarWidth,
            height: contentHeight,
        });
        widgets.set(scrollbar.uid, scrollbar);

        // Keep the visible rail and thumb as root siblings. Static children
        // of a generated scrollbar container were not consistently rendered
        // by the GL widget walker, even though scrolling itself worked.
        const track = makeWidget(groupId, ComponentIds.SCROLLBAR_TRACK, rootUid, {
            type: 3,
            rawX: scrollbarX,
            rawY: contentTop,
            rawWidth: layout.content.scrollbarWidth,
            rawHeight: contentHeight,
            width: layout.content.scrollbarWidth,
            height: contentHeight,
            filled: true,
            color: 0x241e16,
        });
        widgets.set(track.uid, track);

        const thumb = makeWidget(groupId, ComponentIds.SCROLLBAR_THUMB, rootUid, {
            type: 3,
            rawX: scrollbarX + 1,
            rawY: contentTop,
            rawWidth: layout.content.scrollbarWidth - 2,
            rawHeight: contentHeight,
            width: layout.content.scrollbarWidth - 2,
            height: contentHeight,
            filled: true,
            color: 0x8f7f66,
            mouseOverColor: 0xc5b79b,
        });
        widgets.set(thumb.uid, thumb);
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
        const controlGap = layout.controls.gap ?? 6;
        const maxControlWidth = Math.max(
            1,
            Math.floor((layout.width - CONTENT_MARGIN_X * 2 - controlGap * (ComponentIds.MAX_CONTROLS - 1)) /
                ComponentIds.MAX_CONTROLS),
        );
        const controlWidth = Math.min(layout.controls.width ?? 92, maxControlWidth);
        const controlHeight = layout.controls.height ?? 20;
        const totalWidth = ComponentIds.MAX_CONTROLS * controlWidth +
            (ComponentIds.MAX_CONTROLS - 1) * controlGap;
        const firstX = Math.max(CONTENT_MARGIN_X, Math.floor((layout.width - totalWidth) / 2));
        for (let i = 0; i < ComponentIds.MAX_CONTROLS; i++) {
            const x = firstX + i * (controlWidth + controlGap);
            const background = makeWidget(groupId, ComponentIds.CONTROL_BACKGROUND_BASE + i, rootUid, {
                type: 3, rawX: x, rawY: 10, rawWidth: controlWidth, rawHeight: controlHeight,
                yPositionMode: 2, width: controlWidth, height: controlHeight, filled: true,
                color: 0x241e16, mouseOverColor: 0x3a3022, opacity: 104,
                actions: ["Select"], flags: FLAG_TRANSMIT_OP1, isHidden: true, hidden: true,
            });
            const label = makeWidget(groupId, ComponentIds.CONTROL_LABEL_BASE + i, rootUid, {
                type: 4, rawX: x, rawY: 10, rawWidth: controlWidth, rawHeight: controlHeight,
                yPositionMode: 2, width: controlWidth, height: controlHeight, text: "",
                fontId: FONT_BOLD_12, textColor: 0xffd27f, textShadowed: true,
                xTextAlignment: 1, yTextAlignment: 1, isHidden: true, hidden: true,
            });
            widgets.set(background.uid, background);
            widgets.set(label.uid, label);
        }
    }

    return { root, widgets };
}
