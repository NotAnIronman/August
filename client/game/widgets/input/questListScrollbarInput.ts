import type { WidgetManager } from "../../../widgets/WidgetManager";
import { ClickMode } from "../../InputManager";
import type { WidgetInteractionController } from "../WidgetInteractionController";
import type { WidgetInputFrame } from "./widgetInputTypes";

const QUEST_LIST_GROUP_ID = 399;
const QUEST_LIST_SCROLLBAR_UID = (QUEST_LIST_GROUP_ID << 16) | 5;
const QUEST_LIST_CONTENT_UID = (QUEST_LIST_GROUP_ID << 16) | 7;

const SCROLLBAR_WIDTH = 16;
const WHEEL_STEP = 16;

type QuestScrollbarDrag = {
    /**
     * Pointer position inside the thumb, in physical display pixels. Keeping
     * this offset is what makes the handle follow the pointer rather than
     * jumping its centre to the click every input frame.
     */
    grabOffsetY: number;
};

let activeDrag: QuestScrollbarDrag | undefined;

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
        activeDrag = undefined;
        return;
    }

    if (frame.input.clickMode2 !== ClickMode.LEFT) activeDrag = undefined;

    // The quest rail is rendered with a small visual offset from its cache
    // host. It therefore owns its gesture outright, but must never steal an
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

    // The cache's 399:5 host owns the working scrollbar input/clip geometry.
    // Match the renderer's small logical horizontal tweak without changing
    // either widget's bounds or transferring drag ownership to another rail.
    const logicalOffsetX = Math.trunc(scrollbar?.uikitScrollbarOffsetX ?? 0);
    const logicalScrollbarWidth = Math.max(1, scrollbar?.width ?? SCROLLBAR_WIDTH);
    const physicalScrollbarWidth = Math.max(
        1,
        scrollbar?._absWidth ?? scrollbar?.width ?? SCROLLBAR_WIDTH,
    );
    const scaleX = physicalScrollbarWidth / logicalScrollbarWidth;
    const offsetX = Math.round(logicalOffsetX * scaleX);
    const scrollbarX =
        ((scrollbar?._absX ?? scrollbar?.x ?? (content._absX ?? content.x ?? 0)) + offsetX) | 0;
    const scrollbarY =
        (scrollbar?._absY ?? scrollbar?.y ?? (content._absY ?? content.y ?? 0)) | 0;
    const scrollbarHeight = scrollbar
        ? Math.max(0, scrollbar._absHeight ?? scrollbar.height ?? 0)
        : viewportHeight;
    const logicalScrollbarHeight = Math.max(1, scrollbar?.height ?? viewportHeight);
    const scaleY = scrollbarHeight / logicalScrollbarHeight;
    // This is deliberately the same geometry drawScrollBar receives. The
    // previous handler mixed logical content/arrow dimensions with the
    // rendered physical rail, so the visible handle was not the handle being
    // clicked or dragged on non-1x UI scales.
    const arrowHeight = Math.max(1, Math.round(16 * scaleY));
    const trackHeight = scrollbarHeight - arrowHeight * 2;
    const physicalContentHeight = Math.max(1, Math.round(contentHeight * scaleY));
    const physicalScrollY = Math.round((content.scrollY | 0) * scaleY);
    let thumbHeight = Math.floor((scrollbarHeight * trackHeight) / physicalContentHeight);
    thumbHeight = Math.max(Math.max(1, Math.round(8 * scaleY)), thumbHeight);
    const draggableHeight = Math.max(0, trackHeight - thumbHeight);
    const thumbTop =
        scrollbarY +
        arrowHeight +
        (maxScrollY > 0
            ? Math.floor((draggableHeight * physicalScrollY) / Math.max(1, physicalContentHeight - scrollbarHeight))
            : 0);
    if (trackHeight <= 0) return;

    const { input, mx, my } = frame;
    const isOverContent =
        mx >= ((content._absX ?? content.x ?? 0) | 0) &&
        mx < ((content._absX ?? content.x ?? 0) | 0) + (content.width | 0) &&
        my >= ((content._absY ?? content.y ?? 0) | 0) &&
        my < ((content._absY ?? content.y ?? 0) | 0) + viewportHeight;
    const isOverScrollbar =
        mx >= scrollbarX &&
        mx < scrollbarX + Math.max(Math.round(SCROLLBAR_WIDTH * scaleX), physicalScrollbarWidth) &&
        my >= scrollbarY &&
        my < scrollbarY + scrollbarHeight;
    const isNewScrollbarClick =
        input.leftClickX >= scrollbarX &&
        input.leftClickX <
            scrollbarX + Math.max(Math.round(SCROLLBAR_WIDTH * scaleX), physicalScrollbarWidth) &&
        input.leftClickY >= scrollbarY &&
        input.leftClickY < scrollbarY + scrollbarHeight;

    // `399:5` remains at its cache-defined position while its rail is drawn
    // 25 logical pixels to the right. Consume the click at the *drawn*
    // position before the generic picker sees the old host rectangle; that
    // prevents both a phantom drag source and a world click behind the modal.
    if (isNewScrollbarClick) {
        input.leftClickX = -1;
        input.leftClickY = -1;
    }

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

    if (input.clickMode2 !== ClickMode.LEFT) return;

    const setScrollFromThumbTop = (wantedThumbTop: number): void => {
        const thumbOffset = Math.min(Math.max(0, wantedThumbTop - scrollbarY - arrowHeight), draggableHeight);
        setScrollY(
            draggableHeight > 0 ? Math.floor((thumbOffset * maxScrollY) / draggableHeight) : 0,
        );
    };

    // Continue a captured thumb drag even when the pointer slips outside the
    // 16-pixel rail. The generic click picker must never own this gesture.
    if (activeDrag) {
        setScrollFromThumbTop(my - activeDrag.grabOffsetY);
        return;
    }

    // A held click without a new click is not a quest-scrollbar gesture. This
    // prevents a pre-existing click elsewhere from moving the quest list as
    // the cursor passes over it.
    if (!isNewScrollbarClick || !isOverScrollbar) return;

    if (my < scrollbarY + arrowHeight) {
        setScrollY((content.scrollY | 0) - 4);
        return;
    }
    if (my >= scrollbarY + scrollbarHeight - arrowHeight) {
        setScrollY((content.scrollY | 0) + 4);
        return;
    }

    const clickedThumb = my >= thumbTop && my < thumbTop + thumbHeight;
    activeDrag = {
        grabOffsetY: clickedThumb ? my - thumbTop : thumbHeight >> 1,
    };
    setScrollFromThumbTop(my - activeDrag.grabOffsetY);
}
