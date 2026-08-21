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
    });
    widgets.set(root.uid, root);

    // Frame is left as a plain, unfilled layer - SCRIPT_STEELBORDER paints
    // the border/backdrop/title bar/close button onto this component.
    const frame = makeWidget(groupId, ComponentIds.FRAME, rootUid, {
        type: 0,
        widthMode: 1,
        heightMode: 1,
        width: layout.width,
        height: layout.height,
    });
    widgets.set(frame.uid, frame);

    const sidebarWidth = layout.sidebar?.width ?? 0;

    if (layout.sidebar) {
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
    }

    const contentLeft = layout.sidebar ? sidebarWidth + 12 + 16 : CONTENT_MARGIN_X;
    const contentWidth =
        layout.width - contentLeft - CONTENT_MARGIN_X - layout.content.scrollbarWidth;
    const contentHeight = layout.height - CONTENT_TOP - CONTENT_BOTTOM_MARGIN;
    const rowHeight = layout.content.rowHeight;

    const contentView = makeWidget(groupId, ComponentIds.CONTENT_VIEW, rootUid, {
        type: 0,
        rawX: contentLeft,
        rawY: CONTENT_TOP,
        rawWidth: contentWidth,
        rawHeight: contentHeight,
        width: contentWidth,
        height: contentHeight,
        scrollX: 0,
        scrollY: 0,
        scrollWidth: contentWidth,
        scrollHeight: ComponentIds.MAX_ROWS * rowHeight,
    });
    widgets.set(contentView.uid, contentView);
    const contentViewUid = contentView.uid;

    if (layout.content.rowKind === "text") {
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
    } else {
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

    if (layout.content.scrollbarWidth > 0) {
        const scrollbarX = layout.width - layout.content.scrollbarWidth - 12;
        const scrollbar = makeWidget(groupId, ComponentIds.SCROLLBAR, rootUid, {
            type: 0,
            rawX: scrollbarX,
            rawY: CONTENT_TOP,
            rawWidth: layout.content.scrollbarWidth,
            rawHeight: contentHeight,
            width: layout.content.scrollbarWidth,
            height: contentHeight,
        });
        widgets.set(scrollbar.uid, scrollbar);

        const track = makeWidget(groupId, ComponentIds.SCROLLBAR_TRACK, scrollbar.uid, {
            type: 3,
            rawX: 0,
            rawY: 0,
            rawWidth: layout.content.scrollbarWidth,
            rawHeight: contentHeight,
            width: layout.content.scrollbarWidth,
            height: contentHeight,
            filled: true,
            color: 0x241e16,
        });
        widgets.set(track.uid, track);

        const thumb = makeWidget(groupId, ComponentIds.SCROLLBAR_THUMB, scrollbar.uid, {
            type: 3,
            rawX: 1,
            rawY: 0,
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

    return { root, widgets };
}
