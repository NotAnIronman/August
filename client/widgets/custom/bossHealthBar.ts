import {
    BOSS_HEALTH_BAR_GROUP_ID,
    BOSS_HEALTH_BAR_SEGMENT_COUNT,
    BossHealthBarComponent,
    bossHealthBarUid,
} from "../../common/ui/bossHealthBar";
import { FONT_BOLD_12 } from "../../ui/fonts";
import type { WidgetNode } from "../WidgetNode";
import { registerUiPanel } from "../uikit/registry";

const BAR_WIDTH = 360;
const BAR_HEIGHT = 26;
const SEGMENT_GAP = 0;
const SEGMENT_WIDTH = BAR_WIDTH / BOSS_HEALTH_BAR_SEGMENT_COUNT;

function widget(componentId: number, parentUid: number, overrides: Partial<WidgetNode>): WidgetNode {
    const uid = bossHealthBarUid(componentId);
    return {
        uid,
        id: uid,
        childIndex: -1,
        parentUid,
        groupId: BOSS_HEALTH_BAR_GROUP_ID,
        fileId: componentId,
        isIf3: true,
        type: 0,
        contentType: 0,
        rawX: 0,
        rawY: 0,
        rawWidth: 0,
        rawHeight: 0,
        widthMode: 0,
        heightMode: 0,
        xPositionMode: 0,
        yPositionMode: 0,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        scrollX: 0,
        scrollY: 0,
        scrollWidth: 0,
        scrollHeight: 0,
        isHidden: false,
        hidden: false,
        cachedHidden: false,
        rootIndex: -1,
        cycle: -1,
        modelFrame: 0,
        modelFrameCycle: 0,
        aspectWidth: 1,
        aspectHeight: 1,
        itemId: -1,
        itemQuantity: 0,
        ...overrides,
    };
}

function buildBossHealthBar() {
    const widgets = new Map<number, WidgetNode>();
    const rootUid = bossHealthBarUid(BossHealthBarComponent.Root);
    const root = widget(BossHealthBarComponent.Root, -1, {
        rawX: 0,
        rawY: 8,
        rawWidth: BAR_WIDTH + 8,
        rawHeight: 50,
        width: BAR_WIDTH + 8,
        height: 50,
        xPositionMode: 1,
    });
    widgets.set(root.uid, root);

    const name = widget(BossHealthBarComponent.Name, rootUid, {
        type: 4,
        rawX: 4,
        rawY: 0,
        rawWidth: BAR_WIDTH,
        rawHeight: 18,
        width: BAR_WIDTH,
        height: 18,
        text: "Boss",
        fontId: FONT_BOLD_12,
        textColor: 0xff981f,
        textShadowed: true,
        xTextAlignment: 1,
        yTextAlignment: 1,
    });
    widgets.set(name.uid, name);

    const frame = widget(BossHealthBarComponent.Frame, rootUid, {
        type: 3,
        rawX: 2,
        rawY: 18,
        rawWidth: BAR_WIDTH + 4,
        rawHeight: BAR_HEIGHT + 4,
        width: BAR_WIDTH + 4,
        height: BAR_HEIGHT + 4,
        filled: true,
        color: 0x111111,
        textColor: 0x111111,
    });
    widgets.set(frame.uid, frame);

    const empty = widget(BossHealthBarComponent.Empty, rootUid, {
        type: 3,
        rawX: 4,
        rawY: 20,
        rawWidth: BAR_WIDTH,
        rawHeight: BAR_HEIGHT,
        width: BAR_WIDTH,
        height: BAR_HEIGHT,
        filled: true,
        color: 0x8b0000,
        textColor: 0x8b0000,
    });
    widgets.set(empty.uid, empty);

    for (let index = 0; index < BOSS_HEALTH_BAR_SEGMENT_COUNT; index++) {
        const segment = widget(BossHealthBarComponent.SegmentStart + index, rootUid, {
            type: 3,
            rawX: 4 + Math.floor(index * SEGMENT_WIDTH),
            rawY: 20,
            rawWidth: Math.ceil(SEGMENT_WIDTH) - SEGMENT_GAP,
            rawHeight: BAR_HEIGHT,
            width: Math.ceil(SEGMENT_WIDTH) - SEGMENT_GAP,
            height: BAR_HEIGHT,
            filled: true,
            color: 0x00c817,
            textColor: 0x00c817,
        });
        widgets.set(segment.uid, segment);
    }

    const value = widget(BossHealthBarComponent.Value, rootUid, {
        type: 4,
        rawX: 4,
        rawY: 20,
        rawWidth: BAR_WIDTH,
        rawHeight: BAR_HEIGHT,
        width: BAR_WIDTH,
        height: BAR_HEIGHT,
        text: "0 / 0 (0.0%)",
        fontId: FONT_BOLD_12,
        textColor: 0xffffff,
        textShadowed: true,
        xTextAlignment: 1,
        yTextAlignment: 1,
    });
    widgets.set(value.uid, value);
    return { root, widgets };
}

registerUiPanel({ groupId: BOSS_HEALTH_BAR_GROUP_ID, build: buildBossHealthBar });
