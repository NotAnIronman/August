import {
    DIARY_TABBED_COMPONENT_CONTENT_VIEW,
    DIARY_TABBED_COMPONENT_DIVIDER,
    DIARY_TABBED_COMPONENT_FRAME,
    DIARY_TABBED_COMPONENT_LINE_BASE,
    DIARY_TABBED_COMPONENT_ROOT,
    DIARY_TABBED_COMPONENT_SCROLLBAR,
    DIARY_TABBED_COMPONENT_SCROLLBAR_THUMB,
    DIARY_TABBED_COMPONENT_SCROLLBAR_TRACK,
    DIARY_TABBED_COMPONENT_TAB_BASE,
    DIARY_TABBED_COMPONENT_TAB_HIGHLIGHT_BASE,
    DIARY_TABBED_MAX_LINES,
    DIARY_TABBED_TAB_COUNT,
} from "../../common/ui/widgets";
import { FONT_BOLD_12, FONT_PLAIN_12 } from "../../ui/fonts";
import { FLAG_TRANSMIT_OP1 } from "../WidgetFlags";
import type { WidgetNode } from "../WidgetNode";

export type WidgetGroupLoadResult = {
    root: WidgetNode | undefined;
    widgets: Map<number, WidgetNode>;
};

const PANEL_WIDTH = 520;
const PANEL_HEIGHT = 320;

const SIDEBAR_WIDTH = 116;
const SIDEBAR_TOP = 36;
const TAB_HEIGHT = 22;

const DIVIDER_X = SIDEBAR_WIDTH + 12;

const SCROLLBAR_WIDTH = 16;
const CONTENT_LEFT = DIVIDER_X + 16;
const CONTENT_TOP = 36;
const CONTENT_BOTTOM_MARGIN = 14;
const CONTENT_RIGHT_MARGIN = SCROLLBAR_WIDTH + 20;

const LINE_HEIGHT = 18;

function panelWidgetUid(groupId: number, componentId: number): number {
    return ((groupId & 0xffff) << 16) | (componentId & 0xffff);
}

function panelWidget(
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
 * Builds the tabbed achievement diary panel: root + frame (steelborder
 * target) + a vertical divider + 4 fixed sidebar tab slots (Easy/Medium/
 * Hard/Elite, with a paired active-state highlight) + a scrollable
 * content viewport of plain text-line rows + a scrollbar (track + thumb).
 *
 * Same architecture as skillGuideTabbed.cs2.ts, minus the icon column -
 * diary tasks are plain colored/strikethrough text, not item entries.
 */
export function buildDiaryTabbedGroup(groupId: number): WidgetGroupLoadResult {
    const widgets = new Map<number, WidgetNode>();
    const rootUid = panelWidgetUid(groupId, DIARY_TABBED_COMPONENT_ROOT);

    const root = panelWidget(groupId, DIARY_TABBED_COMPONENT_ROOT, -1, {
        type: 0,
        widthMode: 1,
        heightMode: 1,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        xPositionMode: 1,
        yPositionMode: 1,
    });
    widgets.set(root.uid, root);

    // Frame is left as a plain, unfilled layer - SCRIPT_STEELBORDER paints
    // the border/backdrop/title bar/close button onto this component.
    const frame = panelWidget(groupId, DIARY_TABBED_COMPONENT_FRAME, rootUid, {
        type: 0,
        widthMode: 1,
        heightMode: 1,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
    });
    widgets.set(frame.uid, frame);

    // Vertical divider between sidebar and content.
    const divider = panelWidget(groupId, DIARY_TABBED_COMPONENT_DIVIDER, rootUid, {
        type: 3,
        rawX: DIVIDER_X,
        rawY: SIDEBAR_TOP,
        rawWidth: 1,
        rawHeight: SIDEBAR_TOP,
        heightMode: 1,
        width: 1,
        height: PANEL_HEIGHT - SIDEBAR_TOP - 14,
        filled: true,
        color: 0x5a5040,
    });
    widgets.set(divider.uid, divider);

    // Sidebar tabs: Easy / Medium / Hard / Elite, fixed at 4 (not
    // data-driven like the skill guide's tab count).
    for (let i = 0; i < DIARY_TABBED_TAB_COUNT; i++) {
        const tabY = SIDEBAR_TOP + i * TAB_HEIGHT;

        // Highlight's component id is LOWER than the tab text's (see the
        // comment on DIARY_TABBED_COMPONENT_TAB_HIGHLIGHT_BASE) so it
        // draws behind, not on top of, the label.
        const highlight = panelWidget(
            groupId,
            DIARY_TABBED_COMPONENT_TAB_HIGHLIGHT_BASE + i,
            rootUid,
            {
                type: 3,
                rawX: 8,
                rawY: tabY - 2,
                rawWidth: SIDEBAR_WIDTH - 4,
                rawHeight: TAB_HEIGHT - 2,
                width: SIDEBAR_WIDTH - 4,
                height: TAB_HEIGHT - 2,
                filled: true,
                color: 0x3a2e1f,
                isHidden: true,
                hidden: true,
            },
        );
        widgets.set(highlight.uid, highlight);

        const tab = panelWidget(groupId, DIARY_TABBED_COMPONENT_TAB_BASE + i, rootUid, {
            type: 4,
            rawX: 16,
            rawY: tabY,
            rawWidth: SIDEBAR_WIDTH - 16,
            rawHeight: TAB_HEIGHT,
            width: SIDEBAR_WIDTH - 16,
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
        });
        widgets.set(tab.uid, tab);
    }

    // Scrollable content viewport.
    const contentWidth = PANEL_WIDTH - CONTENT_LEFT - CONTENT_RIGHT_MARGIN;
    const contentHeight = PANEL_HEIGHT - CONTENT_TOP - CONTENT_BOTTOM_MARGIN;
    const contentView = panelWidget(groupId, DIARY_TABBED_COMPONENT_CONTENT_VIEW, rootUid, {
        type: 0,
        rawX: CONTENT_LEFT,
        rawY: CONTENT_TOP,
        rawWidth: contentWidth,
        rawHeight: contentHeight,
        width: contentWidth,
        height: contentHeight,
        scrollX: 0,
        scrollY: 0,
        scrollWidth: contentWidth,
        scrollHeight: DIARY_TABBED_MAX_LINES * LINE_HEIGHT,
    });
    widgets.set(contentView.uid, contentView);
    const contentViewUid = contentView.uid;

    // Content rows: one text line each, parented under the scrollable
    // content viewport.
    for (let i = 0; i < DIARY_TABBED_MAX_LINES; i++) {
        const line = panelWidget(groupId, DIARY_TABBED_COMPONENT_LINE_BASE + i, contentViewUid, {
            type: 4,
            rawX: 0,
            rawY: i * LINE_HEIGHT,
            rawWidth: 0,
            rawHeight: LINE_HEIGHT,
            widthMode: 1,
            width: contentWidth,
            height: LINE_HEIGHT,
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

    // Scrollbar column: track (static) + thumb (repositioned/resized at
    // runtime by diaryScrollbarInput.ts).
    const scrollbar = panelWidget(groupId, DIARY_TABBED_COMPONENT_SCROLLBAR, rootUid, {
        type: 0,
        rawX: PANEL_WIDTH - SCROLLBAR_WIDTH - 12,
        rawY: CONTENT_TOP,
        rawWidth: SCROLLBAR_WIDTH,
        rawHeight: contentHeight,
        width: SCROLLBAR_WIDTH,
        height: contentHeight,
    });
    widgets.set(scrollbar.uid, scrollbar);

    const track = panelWidget(groupId, DIARY_TABBED_COMPONENT_SCROLLBAR_TRACK, scrollbar.uid, {
        type: 3,
        rawX: 0,
        rawY: 0,
        rawWidth: SCROLLBAR_WIDTH,
        rawHeight: contentHeight,
        width: SCROLLBAR_WIDTH,
        height: contentHeight,
        filled: true,
        color: 0x241e16,
    });
    widgets.set(track.uid, track);

    const thumb = panelWidget(groupId, DIARY_TABBED_COMPONENT_SCROLLBAR_THUMB, scrollbar.uid, {
        type: 3,
        rawX: 1,
        rawY: 0,
        rawWidth: SCROLLBAR_WIDTH - 2,
        rawHeight: contentHeight,
        width: SCROLLBAR_WIDTH - 2,
        height: contentHeight,
        filled: true,
        color: 0x8f7f66,
        mouseOverColor: 0xc5b79b,
    });
    widgets.set(thumb.uid, thumb);

    return { root, widgets };
}
