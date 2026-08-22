import type { WidgetGroupLoadResult } from "./PanelBuilder";
import type { UiScrollController } from "./ScrollController";
import type { UiSearchController } from "./SearchController";
import type { WidgetManager } from "../WidgetManager";
import type { WidgetInteractionController } from "../../game/widgets/WidgetInteractionController";
import type { WidgetInputFrame } from "../../game/widgets/input/widgetInputTypes";

/**
 * UI Kit - panel registry.
 *
 * Each panel built with this kit registers itself here (a single call at
 * module load time - see e.g. client/widgets/custom/skillGuidePanel.ts).
 * CustomWidgetGroups.ts checks this registry first, before its old
 * per-panel if/else chain - so adding a new panel means writing the
 * panel's own file and importing it once, not editing the central
 * dispatch file every time.
 */

export type UiPanelRegistration = {
    groupId: number;
    build: () => WidgetGroupLoadResult;
    scrollController?: UiScrollController;
    searchController?: UiSearchController;
    /** Optional client-local presentation update (used by cache asset inspectors). */
    onProcess?: (widgetManager: WidgetManager) => void;
};

const registeredPanels = new Map<number, UiPanelRegistration>();

export function registerUiPanel(registration: UiPanelRegistration): void {
    if (!Number.isInteger(registration.groupId) || registration.groupId < 0) {
        throw new RangeError("UIKit panel groupId must be a non-negative integer");
    }
    if (registeredPanels.has(registration.groupId)) {
        throw new Error(`UIKit panel group ${registration.groupId} is already registered`);
    }
    registeredPanels.set(registration.groupId, registration);
}

export function getRegisteredUiPanel(groupId: number): WidgetGroupLoadResult | undefined {
    return registeredPanels.get(groupId)?.build();
}

/** Processes registered panel input without coupling input to panel names. */
export function processRegisteredUiPanelInput(
    frame: WidgetInputFrame,
    widgetManager: WidgetManager,
    widgetInteraction: WidgetInteractionController,
): void {
    for (const panel of registeredPanels.values()) {
        panel.onProcess?.(widgetManager);
        panel.scrollController?.process(frame, widgetManager, widgetInteraction);
        panel.searchController?.process(frame, widgetManager, widgetInteraction);
    }
}

/** Gives focused UIKit search fields first claim on keyboard input. */
export function processRegisteredUiPanelKeyInput(
    events: Array<{ keyTyped: number; keyPressed: number }>,
): boolean {
    for (const panel of registeredPanels.values()) {
        if (panel.searchController?.handleKeyEvents(events)) return true;
    }
    return false;
}

/** True when a widget belongs to any UIKit-managed scrollbar. */
export function isRegisteredUiScrollbarWidget(
    widget: unknown,
    widgetManager: WidgetManager,
): boolean {
    for (const panel of registeredPanels.values()) {
        if (panel.scrollController?.isScrollbarWidget(widget, widgetManager)) return true;
    }
    return false;
}
