import {
    JOURNAL_PANEL_COMPONENT_CENTER_BASE,
    JOURNAL_PANEL_COMPONENT_DIVIDER_BASE,
    JOURNAL_PANEL_COMPONENT_FRAME,
    JOURNAL_PANEL_COMPONENT_LINE_BASE,
    JOURNAL_PANEL_COMPONENT_ROOT,
    JOURNAL_PANEL_COMPONENT_SWITCH,
    JOURNAL_PANEL_MAX_LINES,
    QUEST_JOURNAL_PANEL_GROUP_ID,
    QUEST_OVERVIEW_PANEL_GROUP_ID,
} from "../../common/ui/widgets";
import { FONT_PLAIN_12 } from "../../ui/fonts";
import { FLAG_TRANSMIT_OP1 } from "../WidgetFlags";
import type { WidgetNode } from "../WidgetNode";

export type WidgetGroupLoadResult = {
    root: WidgetNode | undefined;
    widgets: Map<number, WidgetNode>;
};

type PanelSize = { width: number; height: number };

/**
 * Per-group panel sizing, trimmed down to roughly match actual content
 * (a handful of text lines), not the old oversized defaults.
 *
 * Quest journal/overview widened to match the skill guide panel's width
 * (520) - they were previously narrower (460) for no real reason, which
 * left text wrapping well before the panel's actual available space.
 */
const PANEL_SIZES: Record<number, PanelSize> = {
    [QUEST_JOURNAL_PANEL_GROUP_ID]: { width: 520, height: 300 },
    [QUEST_OVERVIEW_PANEL_GROUP_ID]: { width: 520, height: 300 },
};

/** Panels that show a secondary "switch view" button (quest journal <-> overview). */
const PANELS_WITH_SWITCH_BUTTON = new Set<number>([
    QUEST_JOURNAL_PANEL_GROUP_ID,
    QUEST_OVERVIEW_PANEL_GROUP_ID,
]);

/** Left/right text margin inside the frame. */
const CONTENT_MARGIN = 16;
/** Body line height - taller than the old 14px for more breathing room. */
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
 * Builds a journal-style panel: root + frame + scrollable body text, and
 * optionally a "switch view" button.
 *
 * No separate title or close-button widgets: SCRIPT_STEELBORDER (227,
 * queued server-side right after opening the modal) draws the title bar
 * text AND a working X close button directly onto the frame component -
 * the same native chrome Bank/Settings/Trade use. Building our own title
 * text and a manual "Close" stone button on top of that just duplicated
 * the title and produced a second, broken close control.
 *
 * Body text is one widget per line. Quest/diary line data uses a blank
 * string ("") to mark a section break (see e.g. buildCooksAssistantJournal),
 * so each line index has a matching divider widget at the same Y - the
 * server toggles which of the pair is visible via set_hidden, turning
 * those blank-line breaks into an actual horizontal rule instead of just
 * empty vertical space.
 */
export function buildJournalPanelGroup(groupId: number): WidgetGroupLoadResult {
    const widgets = new Map<number, WidgetNode>();
    const size = PANEL_SIZES[groupId] ?? { width: 520, height: 300 };
    const rootUid = panelWidgetUid(groupId, JOURNAL_PANEL_COMPONENT_ROOT);
    const hasSwitchButton = PANELS_WITH_SWITCH_BUTTON.has(groupId);

    const root = panelWidget(groupId, JOURNAL_PANEL_COMPONENT_ROOT, -1, {
        type: 0,
        widthMode: 1,
        heightMode: 1,
        width: size.width,
        height: size.height,
        xPositionMode: 1,
        yPositionMode: 1,
    });
    widgets.set(root.uid, root);

    // Frame is left as a plain, unfilled layer - SCRIPT_STEELBORDER paints
    // the border/backdrop/title bar/close button onto this component.
    const frame = panelWidget(groupId, JOURNAL_PANEL_COMPONENT_FRAME, rootUid, {
        type: 0,
        widthMode: 1,
        heightMode: 1,
        width: size.width,
        height: size.height,
    });
    widgets.set(frame.uid, frame);

    // Body text: one child widget per line, stacked top to bottom, plus a
    // paired divider widget at the same Y for blank-line section breaks.
    const bodyTop = 34;
    const bodyBottomMargin = hasSwitchButton ? 36 : 12;
    const bodyHeight = size.height - bodyTop - bodyBottomMargin;
    const contentWidth = size.width - CONTENT_MARGIN * 2;
    for (let i = 0; i < JOURNAL_PANEL_MAX_LINES; i++) {
        const rawY = bodyTop + i * LINE_HEIGHT;
        const beyondBody = rawY + LINE_HEIGHT > bodyTop + bodyHeight;

        const line = panelWidget(groupId, JOURNAL_PANEL_COMPONENT_LINE_BASE + i, rootUid, {
            type: 4,
            rawX: CONTENT_MARGIN,
            rawY,
            rawWidth: CONTENT_MARGIN * 2,
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
            isHidden: beyondBody,
            hidden: beyondBody,
        });
        widgets.set(line.uid, line);

        // Centered variant of the same slot, used for header-style lines
        // (e.g. achievement diary tier headers) instead of the left-aligned
        // text widget above.
        const centered = panelWidget(groupId, JOURNAL_PANEL_COMPONENT_CENTER_BASE + i, rootUid, {
            type: 4,
            rawX: CONTENT_MARGIN,
            rawY,
            rawWidth: CONTENT_MARGIN * 2,
            rawHeight: LINE_HEIGHT,
            widthMode: 1,
            width: contentWidth,
            height: LINE_HEIGHT,
            text: "",
            fontId: FONT_PLAIN_12,
            textColor: 0xe8ded0,
            textShadowed: true,
            xTextAlignment: 1,
            yTextAlignment: 1,
            isHidden: true,
            hidden: true,
        });
        widgets.set(centered.uid, centered);

        // Thin divider rect, same slot, shown instead of the text line
        // when that line's content is a section-break marker.
        const divider = panelWidget(groupId, JOURNAL_PANEL_COMPONENT_DIVIDER_BASE + i, rootUid, {
            type: 3,
            rawX: CONTENT_MARGIN,
            rawY: rawY + Math.floor(LINE_HEIGHT / 2) - 1,
            rawWidth: CONTENT_MARGIN * 2,
            rawHeight: 1,
            widthMode: 1,
            width: contentWidth,
            height: 1,
            filled: true,
            color: 0x5a5040,
            isHidden: true,
            hidden: true,
        });
        widgets.set(divider.uid, divider);
    }

    if (hasSwitchButton) {
        const switchButton = panelWidget(groupId, JOURNAL_PANEL_COMPONENT_SWITCH, rootUid, {
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
            opacity: 32,
            actions: ["View"],
            flags: FLAG_TRANSMIT_OP1,
        });
        widgets.set(switchButton.uid, switchButton);
    }

    return { root, widgets };
}
