import { ClickMode } from "../../InputManager";
import type { WidgetInputControllerDeps, WidgetInputFrame, WidgetInputState } from "./widgetInputTypes";
import type { WidgetInteractionController } from "../WidgetInteractionController";
import type { WidgetManager } from "../../../widgets/WidgetManager";
import { reportRuntimeProbe } from "../../../debug/runtimeProbe";

const QUEST_LIST_CONTENT_UID = (399 << 16) | 7;
const questRailDiscoveryTraceSeen = new Set<number>();

export function processWidgetIf1ScrollbarInput(
    deps: WidgetInputControllerDeps,
    state: WidgetInputState,
    frame: WidgetInputFrame,
    widgetManager: WidgetManager,
    widgetInteraction: WidgetInteractionController,
): void {
    const { input, mx, my, allRoots, getStaticChildren } = frame;
    if (!widgetInteraction.isDraggingWidget) {
        state.if1AlternativeScrollbarWidth = state.if1ScrollbarDragging ? 32 : 0;
        state.if1ScrollbarDragging = false;

        const isLeftHeld = input.clickMode2 === ClickMode.LEFT;
        const if1WheelDelta = input.wheelDeltaY;
        if (isLeftHeld || if1WheelDelta !== 0) {
            const SCROLLBAR_WIDTH = 16;
            const ARROW_HEIGHT = 16;
            let handledWheel = false;

            const handleIf1Scrollbars = (
                widget: any,
                parentAbsX: number,
                parentAbsY: number,
            ): boolean => {
                if (!widget) return false;
                const uid = (widget.uid ?? 0) | 0;
                if (uid !== 0 && widgetManager.isEffectivelyHidden(uid)) return false;
                if (widget.hidden || widget.hide) return false;

                const absX = (parentAbsX + (widget.x ?? 0)) | 0;
                const absY = (parentAbsY + (widget.y ?? 0)) | 0;

                const widgetType = ((widget.type ?? 0) | 0) as number;
                const widgetWidth = (widget.width ?? 0) | 0;
                const widgetHeight = (widget.height ?? 0) | 0;
                const scrollHeight = (widget.scrollHeight ?? 0) | 0;
                // UIKit rails are rendered by a cache host but deliberately
                // scroll a different target widget. Their target has its own
                // input controller; allowing legacy IF1 handling here makes
                // the visible thumb and the draggable state disagree.
                const hasDedicatedScrollbarTarget =
                    typeof widget.uikitScrollbarTargetUid === "number" &&
                    widget.uikitScrollbarTargetUid >= 0;
                const isIf1Scrollable =
                    !hasDedicatedScrollbarTarget &&
                    widgetType === 0 &&
                    widget.isIf3 === false &&
                    scrollHeight > widgetHeight;

                // A UIKit rail can be rendered by a cache widget but own the
                // scroll position of another widget. Make this the same input
                // path as a native IF1 rail instead of maintaining a second,
                // quest-specific approximation of the rendered thumb.
                const dedicatedTarget = hasDedicatedScrollbarTarget
                    ? widgetManager.getWidgetByUid(widget.uikitScrollbarTargetUid)
                    : undefined;
                if (dedicatedTarget) {
                    widgetManager.ensureLayout(dedicatedTarget);
                    const targetHeight = (dedicatedTarget.height ?? 0) | 0;
                    const targetScrollHeight = (dedicatedTarget.scrollHeight ?? 0) | 0;
                    const maxScrollY = Math.max(0, targetScrollHeight - targetHeight);
                    if (maxScrollY > 0) {
                        // `_abs*` is the same resolved screen-space geometry
                        // used by the UIKit renderer. The IF1 recursive
                        // parent coordinates above are useful for old cache
                        // widgets, but this rail is drawn with root scaling
                        // and an explicit offset, so using them created the
                        // visible-but-unhittable fake handle.
                        const hostX = (widget._absX ?? absX) | 0;
                        const hostY = (widget._absY ?? absY) | 0;
                        const hostWidth = Math.max(1, (widget._absWidth ?? widgetWidth) | 0);
                        const hostHeight = Math.max(1, (widget._absHeight ?? widgetHeight) | 0);
                        const scaleX = hostWidth / Math.max(1, widgetWidth);
                        const scaleY = hostHeight / Math.max(1, widgetHeight);
                        const scrollbarX = hostX + Math.round((widget.uikitScrollbarOffsetX ?? 0) * scaleX);
                        const scrollbarWidth = Math.max(1, Math.round(SCROLLBAR_WIDTH * scaleX));
                        const arrowHeight = Math.max(1, Math.round(ARROW_HEIGHT * scaleY));
                        if (
                            dedicatedTarget.uid === QUEST_LIST_CONTENT_UID &&
                            !questRailDiscoveryTraceSeen.has(widget.uid | 0)
                        ) {
                            questRailDiscoveryTraceSeen.add(widget.uid | 0);
                            reportRuntimeProbe("quest_scrollbar_rail_discovered", {
                                hostUid: widget.uid,
                                targetUid: dedicatedTarget.uid,
                                hostX,
                                hostY,
                                hostWidth,
                                hostHeight,
                                scrollbarX,
                                scrollbarWidth,
                                scaleX,
                                scaleY,
                            });
                        }
                        const setScrollY = (value: number): void => {
                            dedicatedTarget.scrollY = Math.min(Math.max(0, value | 0), maxScrollY);
                            widgetManager.invalidateScroll(dedicatedTarget);
                            widgetManager.invalidateWidgetRender(dedicatedTarget, "uikit-scrollbar");
                        };
                        const isOverRail =
                            mx >= scrollbarX &&
                            mx < scrollbarX + scrollbarWidth &&
                            my >= hostY &&
                            my < hostY + hostHeight;
                        if (isLeftHeld && isOverRail) {
                            if (input.leftClickX !== -1 && input.leftClickY !== -1) {
                                reportRuntimeProbe("quest_scrollbar_capture", {
                                    hostUid: widget.uid,
                                    targetUid: dedicatedTarget.uid,
                                    mouseX: mx,
                                    mouseY: my,
                                    scrollbarX,
                                    scrollbarY: hostY,
                                    scrollbarHeight: hostHeight,
                                    scrollY: dedicatedTarget.scrollY ?? 0,
                                    scrollHeight: targetScrollHeight,
                                    viewportHeight: targetHeight,
                                });
                            }
                            // Prevent the generic click/drag owner from
                            // claiming the decorative host after this handler
                            // has claimed the actual rendered rail.
                            input.leftClickX = -1;
                            input.leftClickY = -1;
                            if (my < hostY + arrowHeight) {
                                setScrollY((dedicatedTarget.scrollY ?? 0) - 4);
                            } else if (my >= hostY + hostHeight - arrowHeight) {
                                setScrollY((dedicatedTarget.scrollY ?? 0) + 4);
                            } else {
                                const physicalScrollHeight = Math.max(1, Math.round(targetScrollHeight * scaleY));
                                let thumbHeight = Math.floor(
                                    (hostHeight * (hostHeight - arrowHeight * 2)) / physicalScrollHeight,
                                );
                                thumbHeight = Math.max(Math.max(1, Math.round(8 * scaleY)), thumbHeight);
                                const trackHeight = hostHeight - arrowHeight * 2 - thumbHeight;
                                const clickPosY = my - hostY - arrowHeight - (thumbHeight >> 1);
                                setScrollY(
                                    trackHeight > 0
                                        ? Math.floor((clickPosY * maxScrollY) / trackHeight)
                                        : 0,
                                );
                                state.if1ScrollbarDragging = true;
                            }
                            return true;
                        }
                        if (
                            !handledWheel &&
                            if1WheelDelta !== 0 &&
                            mx >= hostX &&
                            mx < scrollbarX + scrollbarWidth &&
                            my >= hostY &&
                            my < hostY + hostHeight
                        ) {
                            setScrollY((dedicatedTarget.scrollY ?? 0) + if1WheelDelta * 45);
                            handledWheel = true;
                        }
                    }
                }

                if (isIf1Scrollable) {
                    const scrollbarX = absX + widgetWidth;
                    const maxScrollY = Math.max(0, scrollHeight - widgetHeight);
                    const clampScrollY = (value: number): number =>
                        Math.min(Math.max(0, value | 0), maxScrollY);

                    if (isLeftHeld) {
                        if (
                            mx >= scrollbarX &&
                            mx < scrollbarX + SCROLLBAR_WIDTH &&
                            my >= absY &&
                            my < absY + ARROW_HEIGHT
                        ) {
                            widget.scrollY = clampScrollY((widget.scrollY ?? 0) - 4);
                            widgetManager.invalidateScroll(widget);
                            return true;
                        }
                        if (
                            mx >= scrollbarX &&
                            mx < scrollbarX + SCROLLBAR_WIDTH &&
                            my >= absY + widgetHeight - ARROW_HEIGHT &&
                            my < absY + widgetHeight
                        ) {
                            widget.scrollY = clampScrollY((widget.scrollY ?? 0) + 4);
                            widgetManager.invalidateScroll(widget);
                            return true;
                        }
                        if (
                            mx >= scrollbarX - state.if1AlternativeScrollbarWidth &&
                            mx <
                                scrollbarX +
                                    SCROLLBAR_WIDTH +
                                    state.if1AlternativeScrollbarWidth &&
                            my >= absY + ARROW_HEIGHT &&
                            my < absY + widgetHeight - ARROW_HEIGHT
                        ) {
                            let thumbHeight = Math.floor(
                                (widgetHeight * (widgetHeight - 32)) / scrollHeight,
                            );
                            if (thumbHeight < 8) thumbHeight = 8;
                            const clickPosY = my - absY - ARROW_HEIGHT - (thumbHeight >> 1);
                            const trackHeight = widgetHeight - 32 - thumbHeight;
                            widget.scrollY = clampScrollY(
                                trackHeight > 0
                                    ? Math.floor(
                                          (clickPosY * (scrollHeight - widgetHeight)) /
                                              trackHeight,
                                      )
                                    : 0,
                            );
                            widgetManager.invalidateScroll(widget);
                            state.if1ScrollbarDragging = true;
                            return true;
                        }
                    }

                    if (
                        !handledWheel &&
                        if1WheelDelta !== 0 &&
                        mx >= scrollbarX - widgetWidth &&
                        my >= absY &&
                        mx < scrollbarX + SCROLLBAR_WIDTH &&
                        my <= absY + widgetHeight
                    ) {
                        widget.scrollY = clampScrollY(
                            (widget.scrollY ?? 0) + if1WheelDelta * 45,
                        );
                        widgetManager.invalidateScroll(widget);
                        handledWheel = true;
                    }
                }

                const childBaseX = absX - ((widget.scrollX ?? 0) | 0);
                const childBaseY = absY - ((widget.scrollY ?? 0) | 0);

                if (widget.uid !== undefined) {
                    const staticChildren = getStaticChildren(widget.uid);
                    for (let i = staticChildren.length - 1; i >= 0; i--) {
                        if (handleIf1Scrollbars(staticChildren[i], childBaseX, childBaseY)) {
                            return true;
                        }
                    }
                }
                if (Array.isArray(widget.children)) {
                    for (let i = widget.children.length - 1; i >= 0; i--) {
                        const child = widget.children[i];
                        if (handleIf1Scrollbars(child, childBaseX, childBaseY)) return true;
                    }
                }
                return false;
            };

            for (let i = allRoots.length - 1; i >= 0; i--) {
                if (handleIf1Scrollbars(allRoots[i], 0, 0)) break;
            }
            if (handledWheel) {
                input.wheelDeltaY = 0;
            }
        }
    }
}
