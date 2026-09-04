import assert from "node:assert/strict";
import { WidgetActionRouter } from "@client/engine/game/widgets/WidgetActionRouter";
import { TAB_BINDING_VARBITS } from "@client/engine/game/widgets/TabKeybindingSettingsController";
import { getNativeSettingSelection } from "@client/engine/game/widgets/nativeSettingSelection";

const bits = new Map<number, number>();
const modes: number[] = [];
const router = new WidgetActionRouter({
    getWidgetManager: () => undefined,
    getVarManager: () => ({ getVarbit: (id: number) => bits.get(id) ?? 0, setVarbit: (id: number, v: number) => bits.set(id, v) }),
    requestDisplayMode: (mode: number) => modes.push(mode),
} as never);

for (let row = 0; row < 14; row++) {
    router.prepareClientSettingAction({ widget: { groupId: 121, fileId: 9 + row * 7 }, option: "Choose" });
    const key = (row % 12) + 1;
    const commit = router.prepareClientSettingAction({
        widget: { groupId: 121, fileId: -1, parentUid: (121 << 16) | 111, childIndex: key }, option: "Select",
    });
    assert.equal(commit?.(), true, "native popup selection has a commit path");
    assert.equal(bits.get(TAB_BINDING_VARBITS[row]), key);
    assert.equal([...bits.values()].filter(v => v === key).length, 1, "duplicate keys are reassigned");
}

function native(type: number, id: number, value: number, legacy = false): any {
    const args = [type, 12, value, 34, 56, 78, 90, 123, 456, 1159, id, 1, 0, 1];
    return { option: "Select", widget: {
        uid: (134 << 16) | 500, groupId: 134, fileId: -1, childIndex: 8,
        ...(legacy ? { onOp: [3852, args[0], "label", ...args.slice(1)] } : { eventHandlers: { onOp: { scriptId: 3852, intArgs: args } } }),
    } };
}
const settingVarbits = [4675,4680,4686,4676,4682,4687,4677,4684,4683,4678,6517,4688,4679,4689];
for (let id = 16; id <= 29; id++) {
    const event = native(3, id, 4, id % 2 === 0);
    assert.deepEqual(getNativeSettingSelection(event), { type: 3, id, value: 4 });
    assert.equal(router.prepareClientSettingAction(event)?.(), true);
    assert.equal(bits.get(settingVarbits[id - 16]), 4);
    assert.equal([...bits.values()].filter(v => v === 4).length, 1);
}
assert.equal(router.prepareClientSettingAction(native(3, 29, 0))?.(), true);
assert.equal(bits.get(4689), 0, "None clears a previously saved binding");
for (const mode of [0, 1, 2]) assert.equal(router.prepareClientSettingAction(native(2, 12, mode))?.(), true);
assert.deepEqual(modes, [0, 1, 2], "layout choices request actual mode changes");
assert.equal(getNativeSettingSelection({ ...native(2,12,0), option: "Choose" }), undefined);
assert.equal(router.prepareClientSettingAction(native(2,12,99)), undefined);
assert.equal(router.prepareClientSettingAction(native(3,16,99)), undefined);
console.log("Native keybinding dropdowns and layout requests passed");
