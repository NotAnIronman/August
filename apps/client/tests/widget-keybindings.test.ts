import assert from "node:assert/strict";

import { InputManager } from "@client/core/input/InputManager";
import { processWidgetKeyboardInput } from "@client/engine/game/widgets/input/widgetKeyboardInput";
import { resolveWidgetOpKey } from "@client/engine/game/widgets/input/widgetOpKey";

const input = new InputManager();
const actions: any[] = [];
const bindings = Array.from({ length: 12 }, (_, index) => ({
    uid: (161 << 16) | (index + 1),
    hasKeyBindings: true,
    actions: ["Open"],
    opKeys: [{ keyChars: [index + 1], keyCodes: [0], opIndex: 1 }],
}));
const root = { uid: 161 << 16, children: bindings };
const vm = { inputDialogType: 0 };
const deps: any = {
    getCs2Vm: () => vm,
    getItemSpawnerUi: () => ({ handleSearchKeyEvents: () => false }),
    getEnterToTypeChat: () => ({
        handleKeyEvent: () => false,
        shouldBlockChatboxKeys: () => false,
        isUnlocked: false,
    }),
    handleWidgetAction: (action: any) => actions.push(action),
};
const frame: any = {
    input, mx: 0, my: 0, allRoots: [root, root],
    visibleMap: new Map(), getStaticChildren: () => [],
};
const manager: any = {
    interfaceParents: new Map(), rootInterface: 161,
    isEffectivelyHidden: () => false,
    getAllGroupRoots: () => [root],
};
function press(f: number, repeat = false): void {
    (input as any).onKeyDown({
        key: `F${f}`, code: `F${f}`, keyCode: 111 + f,
        repeat, preventDefault() {},
    });
}
function dispatch(): void {
    processWidgetKeyboardInput(deps, frame, manager);
    input.keyEvents.length = 0;
}
for (let f = 1; f <= 12; f++) {
    press(f);
    dispatch();
    assert.equal(actions.at(-1).widget, bindings[f - 1]);
    assert.equal(actions.at(-1).opIndex, 1);
    assert.equal(actions.at(-1).source, "menu");
    assert.equal(actions.length, f, "each key activates exactly one tab even with duplicate roots");
}
actions.length = 0;
press(1, true);
dispatch();
assert.equal(actions.length, 0, "held F keys do not toggle tabs repeatedly");

bindings[0].opKeys[0].keyChars = [2];
bindings[1].opKeys[0].keyChars = [1];
press(1);
dispatch();
assert.equal(actions.pop().widget, bindings[1], "updated settings change the target tab immediately");
bindings[1].opKeys = [];
press(1);
dispatch();
assert.equal(actions.length, 0, "clearing a binding disables it");

frame.visibleMap.set(bindings[0].uid, false);
press(2);
dispatch();
assert.equal(actions.length, 0, "hidden tabs are not activated");
frame.visibleMap.clear();
frame.allRoots = [];
manager.interfaceParents.set(123, { group: 548 });
press(2);
dispatch();
assert.equal(actions.pop().widget, bindings[0], "mounted interfaces receive key bindings");
vm.inputDialogType = 1;
press(2);
dispatch();
assert.equal(actions.length, 0, "input dialogs retain exclusive ownership of keys");

const binding = { opKeys: [null, { keyChars: [1], keyCodes: [7], opIndex: 2 }] };
assert.equal(resolveWidgetOpKey(binding, 1, () => false), undefined);
assert.equal(resolveWidgetOpKey(binding, 1, key => [81, 82, 86].includes(key)), 2);
binding.opKeys[1]!.keyCodes = [8];
assert.equal(resolveWidgetOpKey(binding, 1, () => false), 2);
assert.equal(resolveWidgetOpKey(binding, 1, key => key === 82), undefined);
assert.equal(resolveWidgetOpKey(binding, -1, () => false), undefined);
console.log("widget F-key bindings passed");
