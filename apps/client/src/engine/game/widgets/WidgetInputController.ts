import type { WidgetManager } from "@client/ui/widgets/WidgetManager";
import type { InputManager } from "@client/core/input/InputManager";
import type { WidgetInteractionController } from "@client/engine/game/widgets/WidgetInteractionController";
import {
    isQuestListScrollbarWidget,
    processQuestListScrollbarInput,
} from "@client/engine/game/widgets/input/questListScrollbarInput";
// Skill guide, diary, quest journal, and quest overview all use the UI
// kit's generic scroll controller now (@client/ui/widgets/uikit/
// ScrollController), not dedicated per-panel files - see the
// controller instances imported below.
import {
    isRegisteredUiScrollbarWidget,
    processRegisteredUiPanelKeyInput,
    processRegisteredUiPanelInput,
} from "@client/ui/widgets/uikit/registry";
import { shouldSkipWidgetClickInput } from "@client/engine/game/widgets/input/widgetClickGuard";
import { processWidgetClickInput } from "@client/engine/game/widgets/input/widgetClickInput";
import { processWidgetDragInput } from "@client/engine/game/widgets/input/widgetDragInput";
import { processWidgetHoldInput } from "@client/engine/game/widgets/input/widgetHoldInput";
import { processWidgetHoverInput } from "@client/engine/game/widgets/input/widgetHoverInput";
import { processWidgetIf1ScrollbarInput } from "@client/engine/game/widgets/input/widgetIf1ScrollbarInput";
import { buildWidgetInputFrame } from "@client/engine/game/widgets/input/widgetInputSetup";
import {
    type WidgetInputControllerDeps,
    type WidgetInputState,
    createWidgetInputState,
} from "@client/engine/game/widgets/input/widgetInputTypes";
import { processWidgetKeyboardInput } from "@client/engine/game/widgets/input/widgetKeyboardInput";
import { processWidgetMenuWheelInput } from "@client/engine/game/widgets/input/widgetMenuWheelInput";
import { processWidgetMinimapWheelInput } from "@client/engine/game/widgets/input/widgetMinimapWheelInput";
import { createPrimaryWidgetActionResolver } from "@client/engine/game/widgets/input/widgetPrimaryAction";
import { processWidgetReleaseInput } from "@client/engine/game/widgets/input/widgetReleaseInput";
import { processWidgetScrollWheelInput } from "@client/engine/game/widgets/input/widgetScrollWheelInput";

export type { WidgetInputControllerDeps } from "@client/engine/game/widgets/input/widgetInputTypes";

/** Per-frame widget hover/scroll/click/drag/keyboard input extracted from OsrsClient. */
export class WidgetInputController {
    private readonly state: WidgetInputState = createWidgetInputState();

    constructor(private readonly deps: WidgetInputControllerDeps) {}

    handleUiInput(): void {
        const input = this.deps.getInputManager();
        const widgetManager = this.deps.getWidgetManager();
        const widgetInteraction = this.deps.getWidgetInteraction();

        const frame = buildWidgetInputFrame(
            this.deps,
            this.state,
            input,
            widgetManager,
            widgetInteraction,
        );
        if (!frame) return;

        const transmitCycles = this.deps.getTransmitCycles();
        const hoverCycle = transmitCycles.cycleCntr | 0;
        if (this.state.lastHoverListenerCycle !== hoverCycle) {
            this.state.lastHoverListenerCycle = hoverCycle;
            processWidgetHoverInput(this.deps, this.state, frame, widgetManager, widgetInteraction);
        }

        processWidgetMenuWheelInput(this.deps, frame);
        // UIKit panels draw their own scrollbars beside IF3 content. Give the
        // active panel first claim on wheel input so underlying minimap and
        // legacy IF1 hit-zones cannot consume its wheel gesture.
        processRegisteredUiPanelInput(frame, widgetManager, widgetInteraction);
        processWidgetMinimapWheelInput(this.deps, frame, widgetManager, widgetInteraction);
        // Quest 399 is a top-level interface in this cache, not an interface
        // parent. Its rail is rendered by one cache child and scrolls another,
        // so it needs its precise controller before the generic IF1 tree walk.
        const handledQuestScrollbar = processQuestListScrollbarInput(
            frame,
            widgetManager,
            widgetInteraction,
        );
        if (!handledQuestScrollbar) {
            processWidgetIf1ScrollbarInput(
                this.deps,
                this.state,
                frame,
                widgetManager,
                widgetInteraction,
            );
        }
        processWidgetScrollWheelInput(this.deps, frame, widgetManager, widgetInteraction);

        if (shouldSkipWidgetClickInput(this.deps, frame)) return;

        const isNewClick = input.leftClickX !== -1 && input.leftClickY !== -1;
        const isHolding = input.isDragging();
        this.deps
            .getWorldMap()
            .handleWorldMapDragInput(frame.hits, frame.mx, frame.my, isNewClick, isHolding);

        const getPrimaryWidgetAction = createPrimaryWidgetActionResolver(
            this.deps,
            input,
            widgetManager,
            widgetInteraction,
        );

        processWidgetClickInput(
            this.deps,
            this.state,
            frame,
            widgetManager,
            widgetInteraction,
            getPrimaryWidgetAction,
            isNewClick,
        );
        // Every kit-built panel's scrollbar thumb has its own dedicated
        // scroll controller (same reason as the quest list's). Must not
        // become a generic draggable widget.
        if (
            !isQuestListScrollbarWidget(widgetInteraction.clickedWidget, widgetManager) &&
            !isRegisteredUiScrollbarWidget(
                widgetInteraction.clickedWidget,
                widgetManager,
            )
        ) {
            processWidgetDragInput(this.deps, frame, widgetManager, widgetInteraction, isHolding);
        }
        processWidgetHoldInput(this.deps, frame, widgetInteraction, isHolding, isNewClick);
        processWidgetReleaseInput(
            this.deps,
            frame,
            widgetManager,
            widgetInteraction,
            getPrimaryWidgetAction,
            isHolding,
        );
        if (!processRegisteredUiPanelKeyInput(input.keyEvents)) {
            processWidgetKeyboardInput(this.deps, frame, widgetManager);
        }
    }
}
