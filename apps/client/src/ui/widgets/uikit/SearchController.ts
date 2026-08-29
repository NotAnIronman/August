import { ClickMode } from "@client/core/input/InputManager";
import type { WidgetInteractionController } from "@client/engine/game/widgets/WidgetInteractionController";
import type { WidgetInputFrame } from "@client/engine/game/widgets/input/widgetInputTypes";
import type { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { ComponentIds } from "@august/protocol/uikit/contracts";

function packUid(groupId: number, componentId: number): number {
    return ((groupId & 0xffff) << 16) | (componentId & 0xffff);
}

export interface UiSearchController {
    process(frame: WidgetInputFrame, widgetManager: WidgetManager, widgetInteraction: WidgetInteractionController): void;
    handleKeyEvents(events: Array<{ keyTyped: number; keyPressed: number }>): boolean;
    /** Programmatically sets the box's text (e.g. pre-filling a name to
     *  edit) and optionally focuses it, without waiting for a click. */
    setQuery(text: string, focus?: boolean): void;
    /** Tints the box distinctly (e.g. "you're editing an existing name,
     *  not searching") without changing its focus/text state. */
    setActive(active: boolean): void;
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
    /** Fired specifically on Enter (in addition to the existing blur-on-enter
     *  behavior) - lets a caller distinguish "submit this" from "still
     *  typing," which onQueryChange alone can't do since it never fires for
     *  the Enter keystroke itself (Enter doesn't change the query text). */
    onSubmit?: (query: string, widgetManager: WidgetManager) => void,
    /**
     * Maximum number of printable characters accepted by this input. UIKit
     * search fields retain the OSRS-standard 80 character limit by default;
     * editor panels can opt into a larger, explicitly bounded value.
     */
    maxLength: number = 80,
): UiSearchController {
    const backgroundUid = packUid(groupId, ComponentIds.SEARCH_BACKGROUND);
    const textUid = packUid(groupId, ComponentIds.SEARCH_TEXT);
    let focused = false;
    let query = "";
    let active = false;
    let lastWidgetManager: WidgetManager | undefined;
    let lastClickMode3 = ClickMode.NONE;
    const inputMaxLength = Math.max(1, Math.trunc(maxLength) || 80);

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
            background.color = active ? 0x4a3a1a : focused ? 0x3a3125 : 0x2b241b;
            background.mouseOverColor = active ? 0x4a3a1a : focused ? 0x3a3125 : 0x342b20;
            manager.invalidateWidgetRender(background);
        }
    };

    return {
        setQuery(text, focus) {
            query = text;
            if (focus !== undefined) focused = focus;
            sync();
        },
        setActive(nextActive) {
            active = nextActive;
            sync();
        },
        process(frame, widgetManager, _widgetInteraction) {
            lastWidgetManager = widgetManager;
            const background = widgetManager.getWidgetByUid(backgroundUid);
            if (!background) {
                focused = false;
                return;
            }
            // Edge-detected on clickMode3 (single-frame pulse), not
            // clickMode2 (which stays LEFT for the whole physical hold -
            // often several frames). Re-evaluating focus every frame the
            // button is held was fine when the only way to focus this box
            // was clicking directly on it (mouse stays over it the whole
            // hold, so nothing changes) - but a caller that focuses this
            // box programmatically from a click on a DIFFERENT widget (see
            // GalleryClickController.ts) would get that focus silently
            // stolen back on the very next frame, while the mouse is still
            // over the other widget and the button hasn't been released yet.
            const clickMode3 = (frame.input as any)?.clickMode3 ?? ClickMode.NONE;
            const isNewClick = clickMode3 !== ClickMode.NONE && lastClickMode3 === ClickMode.NONE;
            lastClickMode3 = clickMode3;
            if (!isNewClick) return;
            // Use the frame's hit stack rather than raw widget coordinates.
            // UIKit panels can be centred/scaled by their modal parent, so a
            // widget's x/y alone are not screen coordinates until it has been
            // rendered or hit-tested at least once.
            const over = frame.collectFromAllRoots(frame.mx, frame.my).some((widget) => {
                const uid = (widget?.uid ?? -1) | 0;
                return uid === backgroundUid || uid === textUid;
            });
            const nextFocused = over;
            if (nextFocused !== focused) {
                focused = nextFocused;
                sync();
            }
        },
        handleKeyEvents(events) {
            if (!focused) return false;
            let next = query;
            let changed = false;
            let submitted = false;
            for (const event of events) {
                // OSRS_KEY_MAP in InputManager.ts remaps DOM keycodes to
                // OSRS's own internal codes: DOM Enter (13) becomes OSRS 84.
                // OSRS code 13 is actually DOM Escape (27) remapped - so this
                // branch, checking keyTyped===13, matched real Enter presses
                // NEVER: they arrive as keyTyped=84, fell through every
                // branch below unmatched, and were silently dropped. 85 here
                // (backspace) happens to already be correct in this map.
                if ((event.keyTyped | 0) === 84) {
                    // Use `next`, not the stale outer `query` - if the final
                    // character and Enter land in the same events batch
                    // (normal for anyone typing at speed, since input is
                    // polled per frame, not per keystroke), `query` here
                    // would still be missing whatever was just typed.
                    query = next;
                    focused = false;
                    sync();
                    if (lastWidgetManager) onSubmit?.(next, lastWidgetManager);
                    submitted = true;
                    continue;
                }
                if ((event.keyTyped | 0) === 85) {
                    if (next.length) { next = next.slice(0, -1); changed = true; }
                    continue;
                }
                if ((event.keyPressed | 0) <= 0 || next.length >= inputMaxLength) continue;
                const char = String.fromCharCode(event.keyPressed | 0);
                if (/^[ -~]$/.test(char)) { next += char; changed = true; }
            }
            // If onSubmit fired this batch, it owns final state now (e.g. it
            // may have called setQuery to clear the box) - the block below
            // would otherwise unconditionally overwrite that with `next`,
            // silently undoing whatever the submit handler just did.
            if (submitted) return true;
            if (changed) {
                query = next;
                sync();
                if (lastWidgetManager) onQueryChange(query, lastWidgetManager);
            }
            return true;
        },
    };
}
