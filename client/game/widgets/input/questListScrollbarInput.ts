import type { WidgetManager } from "../../../widgets/WidgetManager";
import { ClickMode } from "../../InputManager";
import type { WidgetInteractionController } from "../WidgetInteractionController";
import type { WidgetInputFrame } from "./widgetInputTypes";

const QUEST_LIST_GROUP_ID = 399;
const QUEST_LIST_SCROLLBAR_UID = (QUEST_LIST_GROUP_ID << 16) | 5;
const QUEST_LIST_CONTENT_UID = (QUEST_LIST_GROUP_ID << 16) | 7;

const SCROLLBAR_WIDTH = 16;
const ARROW_HEIGHT = 16;
const WHEEL_STEP = 16;

function clampScrollY(value: number, maximum: number): number {
    return Math.min(Math.max(0, value | 0), maximum);
}

export function isQuestListScrollbarWidget(widget: unknown, widgetManager: WidgetManager): boolean {
    let current = widget as { uid?: number; parentUid?: number } | undefined;
    for (let depth = 0; current && depth < 16; depth++) {
        if ((current.uid ?? -1) === QUEST_LIST_CONTENT_UID) return true;
        const parentUid = current.parentUid;
        if (typeof parentUid !== "number" || parentUid < 0) return false;
        current = widgetManager.getWidgetByUid(parentUid);
    }
    return false;
}

/**
 * The quest list rows are client-created from a server payload, so they do not
 * receive the cache script's usual scroll listeners. Handle the list's
 * scrollbar directly, using the same hit zones as an OSRS scrollbar.
 */
export function processQuestListScrollbarInput(
    frame: WidgetInputFrame,
    widgetManager: WidgetManager,
    widgetInteraction: WidgetInteractionController,
): void {
    // Quest-list widgets remain cached after the side journal switches tabs.
    // Do not let their stale bounds consume a wheel event intended for the
    // achievement diary (or any other currently mounted panel).
    if (widgetManager.getInterfaceParentContainerUid(QUEST_LIST_GROUP_ID) === undefined) {
        return;
    }

    // The generic widget-drag controller owns the scrollbar thumb after its
    // initial click. Continue processing that drag, but never steal an
    // unrelated inventory/widget drag that happens to pass over this area.
    if (
        widgetInteraction.isDraggingWidget &&
        !isQuestListScrollbarWidget(widgetInteraction.clickedWidget, widgetManager)
    ) {
        return;
    }

    const content = widgetManager.getWidgetByUid(QUEST_LIST_CONTENT_UID);
    const scrollbar = widgetManager.getWidgetByUid(QUEST_LIST_SCROLLBAR_UID);
    if (!content) return;

    widgetManager.ensureLayout(content);
    if (scrollbar) widgetManager.ensureLayout(scrollbar);

    const viewportHeight = Math.max(0, content.height | 0);
    const contentHeight = Math.max(viewportHeight, content.scrollHeight | 0);
    const maxScrollY = Math.max(0, contentHeight - viewportHeight);
    if (maxScrollY <= 0) return;

    const scrollbarX = scrollbar
        ? (scrollbar._absX ?? scrollbar.x ?? 0) | 0
        : ((content._absX ?? content.x ?? 0) + (content._absWidth ?? content.width ?? 0)) | 0;
    const scrollbarY = scrollbar
        ? (scrollbar._absY ?? scrollbar.y ?? 0) | 0
        : (content._absY ?? content.y ?? 0) | 0;
    const scrollbarHeight = scrollbar
        ? Math.max(0, scrollbar._absHeight ?? scrollbar.height ?? 0)
        : viewportHeight;
    if (scrollbarHeight <= ARROW_HEIGHT * 2) return;

    const { input, mx, my } = frame;
    const isOverContent =
        mx >= ((content._absX ?? content.x ?? 0) | 0) &&
        mx < ((content._absX ?? content.x ?? 0) | 0) + (content.width | 0) &&
        my >= ((content._absY ?? content.y ?? 0) | 0) &&
        my < ((content._absY ?? content.y ?? 0) | 0) + viewportHeight;
    const isOverScrollbar =
        mx >= scrollbarX &&
        mx < scrollbarX + Math.max(SCROLLBAR_WIDTH, scrollbar?._absWidth ?? scrollbar?.width ?? 0) &&
        my >= scrollbarY &&
        my < scrollbarY + scrollbarHeight;

    const setScrollY = (value: number): void => {
        const next = clampScrollY(value, maxScrollY);
        if ((content.scrollY | 0) === next) return;
        content.scrollY = next;
        widgetManager.invalidateScroll(content);
        widgetManager.invalidateWidgetRender(content, "quest-list-scroll");
    };

    if (input.wheelDeltaY !== 0 && (isOverContent || isOverScrollbar)) {
        // Browser wheel deltas vary wildly by device (a mouse often reports
        // +/-100). Treat each gesture as one quest row, rather than turning
        // that browser value into an instant jump to the list endpoint.
        setScrollY(
            (content.scrollY | 0) + (input.wheelDeltaY > 0 ? WHEEL_STEP : -WHEEL_STEP),
        );
        input.wheelDeltaY = 0;
    }

    if (input.clickMode2 !== ClickMode.LEFT || !isOverScrollbar) return;

    if (my < scrollbarY + ARROW_HEIGHT) {
        setScrollY((content.scrollY | 0) - 4);
        return;
    }
    if (my >= scrollbarY + scrollbarHeight - ARROW_HEIGHT) {
        setScrollY((content.scrollY | 0) + 4);
        return;
    }

    const trackHeight = scrollbarHeight - ARROW_HEIGHT * 2;
    const thumbHeight = Math.max(8, Math.floor((viewportHeight * trackHeight) / contentHeight));
    const draggableHeight = Math.max(0, trackHeight - thumbHeight);
    const thumbOffset = my - scrollbarY - ARROW_HEIGHT - (thumbHeight >> 1);
    setScrollY(draggableHeight > 0 ? Math.floor((thumbOffset * maxScrollY) / draggableHeight) : 0);
}
