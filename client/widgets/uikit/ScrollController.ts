import type { WidgetManager } from "../WidgetManager";
import { ClickMode } from "../../game/InputManager";
import type { WidgetInteractionController } from "../../game/widgets/WidgetInteractionController";
import type { WidgetInputFrame } from "../../game/widgets/input/widgetInputTypes";
import { ComponentIds, type UiRowKind } from "./types";

function packUid(groupId: number, componentId: number): number {
    return ((groupId & 0xffff) << 16) | (componentId & 0xffff);
}

function clampScrollY(value: number, maximum: number): number {
    return Math.min(Math.max(0, value | 0), maximum);
}

export interface UiScrollController {
    /** Used by WidgetInputController to exclude this panel's scrollbar
     *  thumb from the generic drag controller, so they don't fight over
     *  the same drag gesture. */
    isScrollbarWidget(widget: unknown, widgetManager: WidgetManager): boolean;
    /** Call once per input frame from WidgetInputController. No-ops
     *  harmlessly if this panel isn't the one currently open. */
    process(
        frame: WidgetInputFrame,
        widgetManager: WidgetManager,
        widgetInteraction: WidgetInteractionController,
    ): void;
}

/**
 * Creates a scroll controller for one panel (identified by groupId),
 * built with this kit's PanelBuilder. This is the single, shared
 * implementation of the scrolling behavior every custom panel in this
 * project needs - previously duplicated near-verbatim across multiple
 * per-panel files (skillGuideScrollbarInput.ts, diaryScrollbarInput.ts).
 * Fixing a bug here fixes it for every panel using this kit, instead of
 * needing the same fix copy-pasted into each one.
 *
 * rowKind/rowHeight tell the controller which component range holds each
 * row's "primary" widget (used to figure out how many rows are actually
 * visible, and therefore how tall the scrollable content really is,
 * without needing the server to separately communicate a row count).
 */
export function createScrollController(
    groupId: number,
    rowKind: UiRowKind,
    rowHeight: number,
): UiScrollController {
    const SCROLLBAR_UID = packUid(groupId, ComponentIds.SCROLLBAR);
    const CONTENT_VIEW_UID = packUid(groupId, ComponentIds.CONTENT_VIEW);
    const THUMB_UID = packUid(groupId, ComponentIds.SCROLLBAR_THUMB);
    const primaryRowBases =
        rowKind === "mixed"
            ? [ComponentIds.TEXT_ROW_LINE_BASE, ComponentIds.ICON_ROW_NAME_BASE]
            : [rowKind === "text" ? ComponentIds.TEXT_ROW_LINE_BASE : ComponentIds.ICON_ROW_NAME_BASE];
    const centerRowBase = rowKind === "icon" ? null : ComponentIds.TEXT_ROW_CENTER_BASE;
    const dividerRowBase = rowKind === "icon" ? null : ComponentIds.TEXT_ROW_DIVIDER_BASE;

    function isScrollbarWidget(widget: unknown, widgetManager: WidgetManager): boolean {
        let current = widget as { uid?: number; parentUid?: number } | undefined;
        for (let depth = 0; current && depth < 16; depth++) {
            if ((current.uid ?? -1) === SCROLLBAR_UID) return true;
            const parentUid = current.parentUid;
            if (typeof parentUid !== "number" || parentUid < 0) return false;
            current = widgetManager.getWidgetByUid(parentUid);
        }
        return false;
    }

    /** A row counts as "visible content" if its primary widget, its
     *  divider variant, or its centered variant (text rows only) is
     *  currently shown - covers every way a text row can render. */
    function computeVisibleRowCount(widgetManager: WidgetManager): number {
        let count = 0;
        for (let i = 0; i < ComponentIds.MAX_ROWS; i++) {
            // `hidden` is the runtime visibility source used by widget
            // rendering. `isHidden` can retain a cache-default value while a
            // server update is queued, which made populated UIKit rows look
            // visible yet report zero rows and hide their scrollbar.
            const isPrimaryVisible = primaryRowBases.some((base) => {
                const primary = widgetManager.getWidgetByUid(packUid(groupId, base + i)) as
                    | { hidden?: boolean }
                    | undefined;
                return !!primary && !primary.hidden;
            });

            let isAltVisible = false;
            if (centerRowBase !== null) {
                const centered = widgetManager.getWidgetByUid(
                    packUid(groupId, centerRowBase + i),
                ) as { hidden?: boolean; isHidden?: boolean } | undefined;
                isAltVisible = isAltVisible || (!!centered && !centered.hidden);
            }
            if (dividerRowBase !== null) {
                const divider = widgetManager.getWidgetByUid(
                    packUid(groupId, dividerRowBase + i),
                ) as { hidden?: boolean; isHidden?: boolean } | undefined;
                isAltVisible = isAltVisible || (!!divider && !divider.hidden);
            }

            if (isPrimaryVisible || isAltVisible) count = i + 1;
        }
        return count;
    }

    function process(
        frame: WidgetInputFrame,
        widgetManager: WidgetManager,
        widgetInteraction: WidgetInteractionController,
    ): void {
        if (
            widgetInteraction.isDraggingWidget &&
            !isScrollbarWidget(widgetInteraction.clickedWidget, widgetManager)
        ) {
            return;
        }

        const scrollbar = widgetManager.getWidgetByUid(SCROLLBAR_UID);
        const content = widgetManager.getWidgetByUid(CONTENT_VIEW_UID);
        const thumb = widgetManager.getWidgetByUid(THUMB_UID);
        if (!scrollbar || !content || !thumb) return;

        widgetManager.ensureLayout(scrollbar);
        widgetManager.ensureLayout(content);

        const rowCount = computeVisibleRowCount(widgetManager);
        const viewportHeight = Math.max(0, content.height | 0);
        const contentHeight = Math.max(viewportHeight, rowCount * rowHeight);
        const maxScrollY = Math.max(0, contentHeight - viewportHeight);

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
            widgetManager.invalidateWidget(thumb, "uikit-scrollbar-thumb");
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
                widgetManager.invalidateWidget(scrollbar, "uikit-scroll");
            }
        };

        // Proactively re-clamp and re-size the thumb every frame - e.g.
        // after switching to a tab/category with fewer rows than the
        // current scroll position, this snaps the view back up instead
        // of showing blank space, and keeps the thumb sized correctly
        // right after open.
        setScrollY(content.scrollY | 0);

        const { input, mx, my } = frame;
        // Hit-test in screen space. A UIKit panel is usually centred inside a
        // modal parent, and raw widget x/y values are local to that parent.
        // The precomputed hit stack already accounts for parent position,
        // scrolling, and display scaling.
        const hitStack = frame.collectFromAllRoots(mx, my);
        const isOverContent = hitStack.some((widget) => {
            const uid = (widget?.uid ?? -1) | 0;
            return uid === CONTENT_VIEW_UID || (widget?.parentUid | 0) === CONTENT_VIEW_UID;
        });
        const isOverScrollbar = hitStack.some((widget) => {
            const uid = (widget?.uid ?? -1) | 0;
            return uid === SCROLLBAR_UID || uid === THUMB_UID || (widget?.parentUid | 0) === SCROLLBAR_UID;
        });

        if (input.wheelDeltaY !== 0 && (isOverContent || isOverScrollbar)) {
            setScrollY((content.scrollY | 0) + input.wheelDeltaY * rowHeight);
            input.wheelDeltaY = 0;
        }

        if (input.clickMode2 !== ClickMode.LEFT || !isOverScrollbar) return;

        const thumbHeight = Math.max(
            20,
            Math.floor((viewportHeight * scrollbarHeight) / contentHeight),
        );
        const draggableHeight = Math.max(0, scrollbarHeight - thumbHeight);
        const thumbOffset = my - scrollbarY - (thumbHeight >> 1);
        setScrollY(
            draggableHeight > 0 ? Math.floor((thumbOffset * maxScrollY) / draggableHeight) : 0,
        );
    }

    return { isScrollbarWidget, process };
}
