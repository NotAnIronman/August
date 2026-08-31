import { ClickMode } from "../../game/InputManager";
import type { WidgetInteractionController } from "../../game/widgets/WidgetInteractionController";
import type { WidgetInputFrame } from "../../game/widgets/input/widgetInputTypes";
import type { WidgetManager } from "../WidgetManager";

function packUid(groupId: number, componentId: number): number {
    return ((groupId & 0xffff) << 16) | (componentId & 0xffff);
}

export interface UiGalleryClickController {
    process(frame: WidgetInputFrame, widgetManager: WidgetManager, widgetInteraction: WidgetInteractionController): void;
}

/**
 * Left/right click hit-testing over a fixed grid of cells (one invisible
 * full-cell hit-zone widget per cell - see ComponentIds.SPRITE_GALLERY_
 * HITZONE_BASE - rather than the visually-precise preview/label widgets,
 * which shrink to the sprite's own aspect-fit pixel size and leave real
 * dead space around small/narrow icons that wouldn't register a click),
 * edge-detected on clickMode3 - the input system's single-frame click pulse
 * (see client/widgets/gl/ui-input.ts, which uses the exact same
 * "clickMode3 !== NONE && lastClickMode3 === NONE" pattern for its own
 * left/right dispatch) - so each physical click fires exactly once, not
 * once per frame while held.
 *
 * getCellRef returns the "archiveId:frame" currently shown in a cell, or
 * undefined for an empty slot (end of a filtered/paginated list). Deliberately
 * has no server round-trip: the client already knows what it rendered in
 * each slot, so there's nothing to look up.
 */
export function createGalleryClickController(
    groupId: number,
    cellCount: number,
    hitZoneBaseComponentId: number,
    getCellRef: (index: number) => string | undefined,
    onLeftClick: (ref: string) => void,
    onRightClick: (ref: string) => void,
): UiGalleryClickController {
    let lastClickMode3 = ClickMode.NONE;

    return {
        process(frame, _widgetManager, _widgetInteraction) {
            const clickMode3 = (frame.input as any)?.clickMode3 ?? ClickMode.NONE;
            const isNewClick = clickMode3 !== ClickMode.NONE && lastClickMode3 === ClickMode.NONE;
            lastClickMode3 = clickMode3;
            if (!isNewClick) return;
            if (clickMode3 !== ClickMode.LEFT && clickMode3 !== ClickMode.RIGHT) return;

            const hits = frame.collectFromAllRoots(frame.mx, frame.my);
            for (let i = 0; i < cellCount; i++) {
                const hitZoneUid = packUid(groupId, hitZoneBaseComponentId + i);
                const hit = hits.some((widget) => ((widget?.uid ?? -1) | 0) === hitZoneUid);
                if (!hit) continue;
                const ref = getCellRef(i);
                if (!ref) return;
                if (clickMode3 === ClickMode.LEFT) onLeftClick(ref);
                else onRightClick(ref);
                return;
            }
        },
    };
}
