import { REWARD_DISPLAY_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import type { WidgetNode } from "@client/ui/widgets/WidgetNode";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";

export const REWARD_DISPLAY_SLOT_BASE = 1000;
const SLOT_COUNT = 12;
const SLOT_SIZE = 38;
const SLOT_GAP = 7;

function uid(componentId: number): number {
    return ((REWARD_DISPLAY_PANEL_GROUP_ID & 0xffff) << 16) | (componentId & 0xffff);
}

function slotWidget(componentId: number, parentUid: number, x: number, y: number, type: number): WidgetNode {
    return {
        uid: uid(componentId), id: uid(componentId), childIndex: -1, parentUid,
        groupId: REWARD_DISPLAY_PANEL_GROUP_ID, fileId: componentId, isIf3: true, type,
        contentType: 0, rawX: x, rawY: y, rawWidth: SLOT_SIZE, rawHeight: SLOT_SIZE,
        width: SLOT_SIZE, height: SLOT_SIZE, widthMode: 0, heightMode: 0,
        xPositionMode: 0, yPositionMode: 0, x, y, scrollX: 0, scrollY: 0,
        scrollWidth: 0, scrollHeight: 0, isHidden: false, hidden: false, cachedHidden: false,
        rootIndex: -1, cycle: -1, modelFrame: 0, modelFrameCycle: 0, aspectWidth: 1,
        aspectHeight: 1, itemId: -1, itemQuantity: 0,
        ...(type === 3 ? { filled: true, color: 0x24201a, transparency: 32 } : { itemQuantityMode: 2, noClickThrough: true }),
    };
}

registerUiPanel({
    groupId: REWARD_DISPLAY_PANEL_GROUP_ID,
    build: () => {
        const built = buildUiPanel(REWARD_DISPLAY_PANEL_GROUP_ID, {
            width: 310, height: 240,
            content: { rowKind: "text", rowHeight: 18, scrollbarWidth: 0 },
        });
        const root = built.root;
        if (!root) return built;
        const rootUid = root.uid;
        for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
            const column = slot % 4;
            const row = Math.floor(slot / 4);
            const x = 64 + column * (SLOT_SIZE + SLOT_GAP);
            const y = 66 + row * (SLOT_SIZE + SLOT_GAP);
            const backgroundId = REWARD_DISPLAY_SLOT_BASE + slot * 2;
            const itemId = backgroundId + 1;
            built.widgets.set(uid(backgroundId), slotWidget(backgroundId, rootUid, x, y, 3));
            built.widgets.set(uid(itemId), slotWidget(itemId, rootUid, x, y, 5));
        }
        return built;
    },
});
