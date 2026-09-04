import assert from "node:assert/strict";
import { deriveMenuEntriesForWidget } from "@client/ui/widgets/menu/WidgetInteractionResolver";

function menu(groupId: number, actions: Array<string | null>, itemId = 12006) {
    return deriveMenuEntriesForWidget({
        uid: groupId << 16, groupId, itemId, actions, onOp: [1],
        opBase: "Item", targetVerb: "Use",
    });
}
const entries = menu(149, [null, "Wield", null, "Check", "Dissolve", "Examine"]);
assert.deepEqual(entries.map(entry => entry.option), ["Wield", "Use", "Check", "Dissolve", "Drop", "Examine", "Cancel"]);
assert.equal(entries.find(entry => entry.option === "Drop")?.opIndex, 0, "synthetic Drop must not reuse the native Dissolve op");
for (const action of ["Drop", "Destroy", "Discard"]) {
    const existing = menu(149, [null, null, null, null, action]);
    assert.equal(existing.filter(entry => /^(drop|destroy|discard)$/i.test(entry.option)).length, 1);
}
for (const group of [12, 15, 335, 336]) {
    assert(!menu(group, ["Withdraw-1"]).some(entry => entry.option === "Drop"), "read-only or bank/trade containers must not gain Drop");
}
assert(!menu(149, [], -1).some(entry => entry.option === "Drop"), "empty inventory slots cannot be dropped");
console.log("inventory disposal menu coverage passed");
