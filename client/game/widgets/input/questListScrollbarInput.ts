import type { WidgetManager } from "../../../widgets/WidgetManager";
import { ClickMode } from "../../InputManager";
import type { WidgetInteractionController } from "../WidgetInteractionController";
import type { WidgetInputFrame } from "./widgetInputTypes";

const QUEST_LIST_GROUP_ID = 399;
const QUEST_LIST_CONTENT_UID = (QUEST_LIST_GROUP_ID << 16) | 7;

const SCROLLBAR_WIDTH = 16;
const ARROW_HEIGHT = 16;
const WHEEL_STEP = 16;

type QuestScrollbarDrag = {
    /** Offset inside the thumb in display pixels, retained for the full drag. */
    grabOffsetY: number;
};

let activeDrag: QuestScrollbarDrag | undefined;
let pointerWasDown = false;

function clampScrollY(value: number, maximum: number): number {
    return Math.min(Math.max(0, value | 0), maximum);
}

/** The dynamic quest rows are descendants of the actual scroll container. */
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
 * Quest 399 is cache-backed rather than built by PanelBuilder, but its
 * scrollbar deliberately uses the same native rail and geometry as the
 * UIKit achievement diary: the scroll owner draws the rail at its right edge.
 */
export function processQuestListScrollbarInput(
    frame: WidgetInputFrame,
    widgetManager: WidgetManager,
    widgetInteraction: WidgetInteractionController,
): boolean {
    const isLeftHeld = frame.input.clickMode2 === ClickMode.LEFT;
    const pointerPressedThisFrame = isLeftHeld && !pointerWasDown;
    pointerWasDown = isLeftHeld;

    if (widgetManager.isEffectivelyHidden(QUEST_LIST_CONTENT_UID)) {
        activeDrag = undefined;
        return false;
    }
    if (!isLeftHeld) activeDrag = undefined;

    if (
        widgetInteraction.isDraggingWidget &&
        !isQuestListScrollbarWidget(widgetInteraction.clickedWidget, widgetManager)
    ) {
        return false;
    }

    const content = widgetManager.getWidgetByUid(QUEST_LIST_CONTENT_UID);
    if (!content) return false;
    widgetManager.ensureLayout(content);
    const renderedContent = content as typeof content & {
        _absWidth?: number;
        _absHeight?: number;
    };

    const logicalViewportHeight = Math.max(0, content.height | 0);
    const contentHeight = Math.max(logicalViewportHeight, content.scrollHeight | 0);
    const maxScrollY = Math.max(0, contentHeight - logicalViewportHeight);
    if (maxScrollY <= 0) return false;

    const contentX = (content._absX ?? content.x ?? 0) | 0;
    const contentY = (content._absY ?? content.y ?? 0) | 0;
    const physicalContentWidth = Math.max(1, renderedContent._absWidth ?? content.width ?? 1);
    const physicalViewportHeight = Math.max(
        1,
        renderedContent._absHeight ?? logicalViewportHeight,
    );
    const scaleX = physicalContentWidth / Math.max(1, content.width | 0);
    const scaleY = physicalViewportHeight / Math.max(1, logicalViewportHeight);

    // This exactly matches renderWidgetTree's direct UIKit scrollbar draw.
    const scrollbarX = contentX + physicalContentWidth;
    const scrollbarY = contentY;
    const scrollbarWidth = Math.max(1, Math.round(SCROLLBAR_WIDTH * scaleX));
    const scrollbarHeight = physicalViewportHeight;
    const arrowHeight = Math.max(1, Math.round(ARROW_HEIGHT * scaleY));
    const trackHeight = scrollbarHeight - arrowHeight * 2;
    if (trackHeight <= 0) return false;

    const physicalContentHeight = Math.max(1, Math.round(contentHeight * scaleY));
    let thumbHeight = Math.floor((scrollbarHeight * trackHeight) / physicalContentHeight);
    thumbHeight = Math.max(Math.max(1, Math.round(8 * scaleY)), thumbHeight);
    const draggableHeight = Math.max(0, trackHeight - thumbHeight);
    const thumbTop =
        scrollbarY +
        arrowHeight +
        (maxScrollY > 0
            ? Math.floor(
                  (draggableHeight * Math.round((content.scrollY | 0) * scaleY)) /
                      Math.max(1, physicalContentHeight - scrollbarHeight),
              )
            : 0);

    const { input, mx, my } = frame;
    const isOverContent =
        mx >= contentX &&
        mx < contentX + physicalContentWidth &&
        my >= contentY &&
        my < contentY + physicalViewportHeight;
    const isOverScrollbar =
        mx >= scrollbarX &&
        mx < scrollbarX + scrollbarWidth &&
        my >= scrollbarY &&
        my < scrollbarY + scrollbarHeight;
    const hasScrollbarClickCoordinates =
        input.leftClickX >= scrollbarX &&
        input.leftClickX < scrollbarX + scrollbarWidth &&
        input.leftClickY >= scrollbarY &&
        input.leftClickY < scrollbarY + scrollbarHeight;
    const isNewScrollbarClick =
        hasScrollbarClickCoordinates || (pointerPressedThisFrame && isOverScrollbar);

    if (hasScrollbarClickCoordinates) {
        input.clickMode3 = ClickMode.NONE;
        input.saveClickX = -1;
        input.saveClickY = -1;
    }

    const setScrollY = (value: number): void => {
        const next = clampScrollY(value, maxScrollY);
        if ((content.scrollY | 0) === next) return;
        content.scrollY = next;
        widgetManager.invalidateScroll(content);
        widgetManager.invalidateWidgetRender(content, "quest-list-scroll");
    };

    if (input.wheelDeltaY !== 0 && (isOverContent || isOverScrollbar)) {
        setScrollY(
            (content.scrollY | 0) + (input.wheelDeltaY > 0 ? WHEEL_STEP : -WHEEL_STEP),
        );
        input.wheelDeltaY = 0;
        return true;
    }
    if (!isLeftHeld) return false;

    const setScrollFromThumbTop = (wantedThumbTop: number): void => {
        const thumbOffset = Math.min(
            Math.max(0, wantedThumbTop - scrollbarY - arrowHeight),
            draggableHeight,
        );
        setScrollY(
            draggableHeight > 0 ? Math.floor((thumbOffset * maxScrollY) / draggableHeight) : 0,
        );
    };

    if (activeDrag) {
        setScrollFromThumbTop(my - activeDrag.grabOffsetY);
        return true;
    }
    if (!isNewScrollbarClick || !isOverScrollbar) return false;

    if (my < scrollbarY + arrowHeight) {
        setScrollY((content.scrollY | 0) - 4);
        return true;
    }
    if (my >= scrollbarY + scrollbarHeight - arrowHeight) {
        setScrollY((content.scrollY | 0) + 4);
        return true;
    }

    const clickedThumb = my >= thumbTop && my < thumbTop + thumbHeight;
    activeDrag = {
        grabOffsetY: clickedThumb ? my - thumbTop : thumbHeight >> 1,
    };
    setScrollFromThumbTop(my - activeDrag.grabOffsetY);
    return true;
}
