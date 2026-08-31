import { REWARD_DISPLAY_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import type { WidgetNode } from "@client/ui/widgets/WidgetNode";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";

export const REWARD_DISPLAY_SLOT_BASE = 1000;
// 4 columns x 4 rows, per feedback on the previous 6+3+3 layout.
const GRID_COLUMNS = 4;
const GRID_ROWS = 4;
const SLOT_COUNT = GRID_COLUMNS * GRID_ROWS;
const SLOT_SIZE = 64; // "about twice as big" as the original 32px slots
const SLOT_GAP = 7;

/** Real, catalog-validated "Casket" item (id 405). Rendered as a type-6 3D
 *  model rather than the flat type-5 sprite - the item definition carries
 *  its own OSRS-authentic camera angles (xan2d/yan2d/zan2d) and zoom, and
 *  the widget renderer self-normalizes that zoom against rawWidth, so this
 *  scales crisply to whatever box we give it instead of a blown-up icon. */
const CHEST_DECORATION_ITEM_ID = 405;
// 850 sits clear of every shared ComponentIds range this panel doesn't use
// (icon-row bases top out at 799, FOOTER_BUTTON starts at 900) so it can't
// collide if this panel later opts into buildUiPanel's footer/search/etc.
const CHEST_COMPONENT_ID = 850;

const PANEL_WIDTH = 480; // widened so the chest (left) and grid (right)
// have real room side-by-side instead of nearly overlapping - the old
// 320px width barely fit the grid alone (277px), let alone both.
const PANEL_HEIGHT = 334; // buildUiPanel's MAINMODAL_SAFE_HEIGHT ceiling
const LEFT_MARGIN = 16;
const RIGHT_MARGIN = 16;
const GRID_TOP = 40;

// Chest keeps its original 140x140 size and its "~30px above the bottom
// edge" vertical position, now anchored to the left side of the panel
// instead of the right (grid moved to the right side in its place).
const CHEST_WIDTH = 140;
const CHEST_HEIGHT = 140;
const CHEST_BOTTOM_MARGIN = 30;
const CHEST_X = LEFT_MARGIN;
const CHEST_Y = PANEL_HEIGHT - CHEST_BOTTOM_MARGIN - CHEST_HEIGHT;

const GRID_WIDTH = GRID_COLUMNS * SLOT_SIZE + (GRID_COLUMNS - 1) * SLOT_GAP;
const GRID_X = PANEL_WIDTH - RIGHT_MARGIN - GRID_WIDTH;

function uid(componentId: number): number {
    return ((REWARD_DISPLAY_PANEL_GROUP_ID & 0xffff) << 16) | (componentId & 0xffff);
}

function slotPosition(slot: number): { x: number; y: number } {
    const column = slot % GRID_COLUMNS;
    const row = Math.floor(slot / GRID_COLUMNS);
    return {
        x: GRID_X + column * (SLOT_SIZE + SLOT_GAP),
        y: GRID_TOP + row * (SLOT_SIZE + SLOT_GAP),
    };
}

function slotWidget(componentId: number, parentUid: number, x: number, y: number): WidgetNode {
    return {
        uid: uid(componentId), id: uid(componentId), childIndex: -1, parentUid,
        groupId: REWARD_DISPLAY_PANEL_GROUP_ID, fileId: componentId, isIf3: true, type: 5,
        contentType: 0, rawX: x, rawY: y, rawWidth: SLOT_SIZE, rawHeight: SLOT_SIZE,
        width: SLOT_SIZE, height: SLOT_SIZE, widthMode: 0, heightMode: 0,
        xPositionMode: 0, yPositionMode: 0, x, y, scrollX: 0, scrollY: 0,
        scrollWidth: 0, scrollHeight: 0, isHidden: false, hidden: false, cachedHidden: false,
        rootIndex: -1, cycle: -1, modelFrame: 0, modelFrameCycle: 0, aspectWidth: 1,
        aspectHeight: 1, itemId: -1, itemQuantity: 0, itemQuantityMode: 2, noClickThrough: true,
        // Rasterize the icon natively at the slot's real size instead of the
        // classic 36x32-then-GL-stretch, which is what was causing the
        // pixelated/aliased look at this larger slot size.
        itemIconRenderWidth: SLOT_SIZE, itemIconRenderHeight: SLOT_SIZE,
    };
}

function chestWidget(parentUid: number): WidgetNode {
    const cuid = uid(CHEST_COMPONENT_ID);
    return {
        uid: cuid, id: cuid, childIndex: -1, parentUid,
        groupId: REWARD_DISPLAY_PANEL_GROUP_ID, fileId: CHEST_COMPONENT_ID, isIf3: true, type: 6,
        contentType: 0, rawX: CHEST_X, rawY: CHEST_Y, rawWidth: CHEST_WIDTH, rawHeight: CHEST_HEIGHT,
        width: CHEST_WIDTH, height: CHEST_HEIGHT, widthMode: 0, heightMode: 0,
        xPositionMode: 0, yPositionMode: 0, x: CHEST_X, y: CHEST_Y, scrollX: 0, scrollY: 0,
        scrollWidth: 0, scrollHeight: 0, isHidden: false, hidden: false, cachedHidden: false,
        rootIndex: -1, cycle: -1, modelFrame: 0, modelFrameCycle: 0, aspectWidth: 1,
        aspectHeight: 1, itemId: CHEST_DECORATION_ITEM_ID, itemQuantity: 1, noClickThrough: false,
    };
}

registerUiPanel({
    groupId: REWARD_DISPLAY_PANEL_GROUP_ID,
    build: () => {
        const built = buildUiPanel(REWARD_DISPLAY_PANEL_GROUP_ID, {
            width: PANEL_WIDTH, height: PANEL_HEIGHT,
            content: { rowKind: "text", rowHeight: 18, scrollbarWidth: 0 },
        });
        const root = built.root;
        if (!root) return built;
        const rootUid = root.uid;
        built.widgets.set(uid(CHEST_COMPONENT_ID), chestWidget(rootUid));
        for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
            const { x, y } = slotPosition(slot);
            const itemId = REWARD_DISPLAY_SLOT_BASE + slot * 2 + 1;
            built.widgets.set(uid(itemId), slotWidget(itemId, rootUid, x, y));
        }
        return built;
    },
});
