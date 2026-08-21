import { ComponentIds } from "../../common/uikit/contracts";
import type { WidgetGroupLoadResult } from "./PanelBuilder";

/** Lightweight, DOM-free assertions for UIKit panel structure tests. */
export function inspectUiPanel(panel: WidgetGroupLoadResult, groupId: number) {
    const uid = (componentId: number) => ((groupId & 0xffff) << 16) | componentId;
    return {
        has(componentId: number): boolean {
            return panel.widgets.has(uid(componentId));
        },
        parentOf(componentId: number): number | undefined {
            return panel.widgets.get(uid(componentId))?.parentUid;
        },
        capturesPointer(): boolean {
            return panel.root?.noClickThrough === true;
        },
        menuButtonCount(): number {
            let count = 0;
            for (let i = 0; i < ComponentIds.MAX_MENU_BUTTONS; i++) {
                if (panel.widgets.has(uid(ComponentIds.MENU_BUTTON_BACKGROUND_BASE + i))) count++;
            }
            return count;
        },
    };
}
