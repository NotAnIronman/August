import { ClickMode } from "../../game/InputManager";
import type { WidgetInteractionController } from "../../game/widgets/WidgetInteractionController";
import type { WidgetInputFrame } from "../../game/widgets/input/widgetInputTypes";
import type { WidgetManager } from "../WidgetManager";
import { ComponentIds } from "./types";

function packUid(groupId: number, componentId: number): number {
    return ((groupId & 0xffff) << 16) | (componentId & 0xffff);
}

export interface UiSearchController {
    process(frame: WidgetInputFrame, widgetManager: WidgetManager, widgetInteraction: WidgetInteractionController): void;
    handleKeyEvents(events: Array<{ keyTyped: number; keyPressed: number }>): boolean;
}

/**
 * Reusable browser-side search input. The callback is deliberately local: a
 * panel that needs server filtering must send an explicit, server-validated
 * action rather than treating typed browser text as trusted state.
 */
export function createSearchController(
    groupId: number,
    placeholder: string,
    onQueryChange: (query: string, widgetManager: WidgetManager) => void,
): UiSearchController {
    const backgroundUid = packUid(groupId, ComponentIds.SEARCH_BACKGROUND);
    const textUid = packUid(groupId, ComponentIds.SEARCH_TEXT);
    let focused = false;
    let query = "";
    let lastWidgetManager: WidgetManager | undefined;

    const sync = () => {
        const manager = lastWidgetManager;
        if (!manager) return;
        const text = manager.getWidgetByUid(textUid);
        const background = manager.getWidgetByUid(backgroundUid);
        if (text) {
            text.text = query.length ? `<col=e8ded0>${query}</col><col=ffcf70>${focused ? "|" : ""}</col>` :
                (focused ? `<col=ffcf70>|</col>` : `<col=8f7f66>${placeholder}</col>`);
            manager.invalidateWidgetRender(text);
        }
        if (background) {
            background.color = focused ? 0x3a3125 : 0x2b241b;
            background.mouseOverColor = focused ? 0x3a3125 : 0x342b20;
            manager.invalidateWidgetRender(background);
        }
    };

    return {
        process(frame, widgetManager, _widgetInteraction) {
            lastWidgetManager = widgetManager;
            const background = widgetManager.getWidgetByUid(backgroundUid);
            if (!background) {
                focused = false;
                return;
            }
            // Use the frame's hit stack rather than raw widget coordinates.
            // UIKit panels can be centred/scaled by their modal parent, so a
            // widget's x/y alone are not screen coordinates until it has been
            // rendered or hit-tested at least once.
            const over = frame.collectFromAllRoots(frame.mx, frame.my).some((widget) => {
                const uid = (widget?.uid ?? -1) | 0;
                return uid === backgroundUid || uid === textUid;
            });
            if (frame.input.clickMode2 === ClickMode.LEFT) {
                const nextFocused = over;
                if (nextFocused !== focused) {
                    focused = nextFocused;
                    sync();
                }
            }
        },
        handleKeyEvents(events) {
            if (!focused) return false;
            let next = query;
            let changed = false;
            for (const event of events) {
                if ((event.keyTyped | 0) === 13) { focused = false; sync(); continue; }
                if ((event.keyTyped | 0) === 85) {
                    if (next.length) { next = next.slice(0, -1); changed = true; }
                    continue;
                }
                if ((event.keyPressed | 0) <= 0 || next.length >= 80) continue;
                const char = String.fromCharCode(event.keyPressed | 0);
                if (/^[ -~]$/.test(char)) { next += char; changed = true; }
            }
            if (changed) {
                query = next;
                sync();
                if (lastWidgetManager) onQueryChange(query, lastWidgetManager);
            }
            return true;
        },
    };
}
