import {
    ACHIEVEMENT_DIARY_PANEL_GROUP_ID,
    DIARY_TABBED_COMPONENT_CONTENT_VIEW,
    DIARY_TABBED_COMPONENT_LINE_BASE,
    DIARY_TABBED_COMPONENT_SCROLLBAR,
    DIARY_TABBED_COMPONENT_SCROLLBAR_THUMB,
    DIARY_TABBED_MAX_LINES,
} from "../../../common/ui/widgets";
import type { WidgetManager } from "../../../widgets/WidgetManager";
import { ClickMode } from "../../InputManager";
import type { WidgetInteractionController } from "../WidgetInteractionController";
import type { WidgetInputFrame } from "./widgetInputTypes";

const SCROLLBAR_UID =
    (ACHIEVEMENT_DIARY_PANEL_GROUP_ID << 16) | DIARY_TABBED_COMPONENT_SCROLLBAR;
const CONTENT_VIEW_UID =
    (ACHIEVEMENT_DIARY_PANEL_GROUP_ID << 16) | DIARY_TABBED_COMPONENT_CONTENT_VIEW;
const THUMB_UID =
    (ACHIEVEMENT_DIARY_PANEL_GROUP_ID << 16) | DIARY_TABBED_COMPONENT_SCROLLBAR_THUMB;

const SCROLLBAR_WIDTH = 16;
const WHEEL_STEP = 18; // matches LINE_HEIGHT in diaryTabbed.cs2.ts

function clampScrollY(value: number, maximum: number): number {
    return Math.min(Math.max(0, value | 0), maximum);
}

/**
 * Same approach as skillGuideScrollbarInput.ts: the diary's content rows
 * are server-populated (set_text/set_hidden), not built via the cache
 * script's usual scroll listeners, so the scrollbar needs to be driven
 * directly here. Content height is computed from which line rows are
 * actually visible rather than trusting a static scrollHeight.
 */
function computeVisibleLineCount(widgetManager: WidgetManager): number {
    let count = 0;
    for (let i = 0; i < DIARY_TABBED_MAX_LINES; i++) {
        const lineUid = (ACHIEVEMENT_DIARY_PANEL_GROUP_ID << 16) | (DIARY_TABBED_COMPONENT_LINE_BASE + i);
        const w = widgetManager.getWidgetByUid(lineUid) as { hidden?: boolean; isHidden?: boolean } | undefined;
        if (w && !w.hidden && !w.isHidden) {
            count = i + 1;
        }
    }
    return count;
}

export function isDiaryScrollbarWidget(widget: unknown, widgetManager: WidgetManager): boolean {
    let current = widget as { uid?: number; parentUid?: number } | undefined;
    for (let depth = 0; current && depth < 16; depth++) {
        if ((current.uid ?? -1) === SCROLLBAR_UID) return true;
        const parentUid = current.parentUid;
        if (typeof parentUid !== "number" || parentUid < 0) return false;
        current = widgetManager.getWidgetByUid(parentUid);
    }
    return false;
}

export function processDiaryScrollbarInput(
    frame: WidgetInputFrame,
    widgetManager: WidgetManager,
    widgetInteraction: WidgetInteractionController,
): void {
    if (
        widgetInteraction.isDraggingWidget &&
        !isDiaryScrollbarWidget(widgetInteraction.clickedWidget, widgetManager)
    ) {
        return;
    }

    const scrollbar = widgetManager.getWidgetByUid(SCROLLBAR_UID);
    const content = widgetManager.getWidgetByUid(CONTENT_VIEW_UID);
    const thumb = widgetManager.getWidgetByUid(THUMB_UID);
    if (!scrollbar || !content || !thumb) return;

    widgetManager.ensureLayout(scrollbar);
    widgetManager.ensureLayout(content);

    const lineCount = computeVisibleLineCount(widgetManager);
    const viewportHeight = Math.max(0, content.height | 0);
    const contentHeight = Math.max(viewportHeight, lineCount * WHEEL_STEP);
    const maxScrollY = Math.max(0, contentHeight - viewportHeight);

    const scrollbarX = (scrollbar._absX ?? scrollbar.x ?? 0) | 0;
    const scrollbarY = (scrollbar._absY ?? scrollbar.y ?? 0) | 0;
    const scrollbarHeight = Math.max(0, scrollbar.height | 0);

    const setThumb = (scrollY: number) => {
        if (scrollbarHeight <= 0) return;
        const thumbHeight =
            maxScrollY > 0
                ? Math.max(20, Math.floor((viewportHeight * scrollbarHeight) / contentHeight))
                : scrollbarHeight;
        const draggableHeight = Math.max(0, scrollbarHeight - thumbHeight);
        const thumbOffset =
            maxScrollY > 0 ? Math.floor((draggableHeight * scrollY) / maxScrollY) : 0;
        thumb.rawY = thumbOffset;
        thumb.y = thumbOffset;
        thumb.rawHeight = thumbHeight;
        thumb.height = thumbHeight;
        widgetManager.invalidateWidget(thumb, "diary-scrollbar-thumb");
    };

    if (maxScrollY <= 0) {
        scrollbar.hidden = true;
        scrollbar.isHidden = true;
        if ((content.scrollY | 0) !== 0) {
            content.scrollY = 0;
            widgetManager.invalidateScroll(content);
        }
        return;
    }
    if (scrollbar.hidden || scrollbar.isHidden) {
        scrollbar.hidden = false;
        scrollbar.isHidden = false;
    }

    const setScrollY = (value: number): void => {
        const next = clampScrollY(value, maxScrollY);
        const changed = (content.scrollY | 0) !== next;
        if (changed) {
            content.scrollY = next;
            widgetManager.invalidateScroll(content);
        }
        setThumb(next);
        if (changed) {
            widgetManager.invalidateWidget(scrollbar, "diary-scroll");
        }
    };

    setScrollY(content.scrollY | 0);

    const { input, mx, my } = frame;
    const isOverContent =
        mx >= ((content._absX ?? content.x ?? 0) | 0) &&
        mx < ((content._absX ?? content.x ?? 0) | 0) + (content.width | 0) &&
        my >= ((content._absY ?? content.y ?? 0) | 0) &&
        my < ((content._absY ?? content.y ?? 0) | 0) + viewportHeight;
    const isOverScrollbar =
        mx >= scrollbarX &&
        mx < scrollbarX + Math.max(SCROLLBAR_WIDTH, scrollbar.width | 0) &&
        my >= scrollbarY &&
        my < scrollbarY + scrollbarHeight;

    if (input.wheelDeltaY !== 0 && (isOverContent || isOverScrollbar)) {
        setScrollY((content.scrollY | 0) + input.wheelDeltaY * WHEEL_STEP);
        input.wheelDeltaY = 0;
    }

    if (input.clickMode2 !== ClickMode.LEFT || !isOverScrollbar) return;

    const thumbHeight = Math.max(20, Math.floor((viewportHeight * scrollbarHeight) / contentHeight));
    const draggableHeight = Math.max(0, scrollbarHeight - thumbHeight);
    const thumbOffset = my - scrollbarY - (thumbHeight >> 1);
    setScrollY(draggableHeight > 0 ? Math.floor((thumbOffset * maxScrollY) / draggableHeight) : 0);
}
