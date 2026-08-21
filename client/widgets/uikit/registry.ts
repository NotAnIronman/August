import type { WidgetGroupLoadResult } from "./PanelBuilder";

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

const registeredPanels = new Map<number, () => WidgetGroupLoadResult>();

export function registerUiPanel(groupId: number, build: () => WidgetGroupLoadResult): void {
    registeredPanels.set(groupId, build);
}

export function getRegisteredUiPanel(groupId: number): WidgetGroupLoadResult | undefined {
    return registeredPanels.get(groupId)?.();
}
