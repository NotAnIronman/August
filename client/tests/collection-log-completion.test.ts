import assert from "node:assert/strict";

import { state } from "../network/serverConnection/state";
import { disposeServerConnection } from "../network/serverConnection/connection/dispose";
import { subscribeCollectionLog } from "../network/serverConnection/subscriptions/ui";
import type { CollectionLogServerPayload } from "../network/serverConnection/types";
import type { WidgetManager, WidgetNode } from "../widgets/WidgetManager";
import {
    COLLECTION_LOG_COMPLETE_COLOR,
    applyCollectionLogCompletionColors,
} from "../widgets/custom/collectionLogCompletion";

function widget(input: Partial<WidgetNode> & Pick<WidgetNode, "uid">): WidgetNode {
    return {
        id: input.uid,
        parentUid: -1,
        groupId: 621,
        fileId: -1,
        type: 0,
        childIndex: -1,
        children: null,
        ...input,
    } as WidgetNode;
}

const textContainer = widget({ uid: 1, children: [] });
const clickContainer = widget({ uid: 2, children: [] });
const textRows = [
    widget({ uid: 10, parentUid: 1, childIndex: 0, type: 4, text: "Incomplete" }),
    widget({
        uid: 11,
        parentUid: 1,
        childIndex: 1,
        type: 4,
        text: "<col=ff981f>Complete</col>",
        text2: "Complete hover",
        textColor: 0xff981f,
        mouseOverColor: 0xffffff,
    }),
    // A support child must not disable child-index mapping for the real rows.
    widget({ uid: 12, parentUid: 1, childIndex: 99, type: 3 }),
];
const clickRows = [
    widget({ uid: 20, parentUid: 2, childIndex: 0, type: 3 }),
    widget({ uid: 21, parentUid: 2, childIndex: 1, type: 3 }),
];
textContainer.children = textRows;
clickContainer.children = clickRows;

const widgets = new Map<number, WidgetNode>([
    [textContainer.uid, textContainer],
    [clickContainer.uid, clickContainer],
    ...textRows.map((entry) => [entry.uid, entry] as const),
    ...clickRows.map((entry) => [entry.uid, entry] as const),
]);
const invalidated: number[] = [];
const manager = {
    getWidgetByUid: (uid: number) => widgets.get(uid),
    getDynamicChildrenByParent: (parent: WidgetNode) =>
        (parent.children ?? []).filter((entry): entry is WidgetNode => entry !== null),
    getStaticChildrenByParentUid: () => [],
    invalidateWidgetRender: (entry: WidgetNode) => invalidated.push(entry.uid),
} as unknown as WidgetManager;

const changed = applyCollectionLogCompletionColors(manager, [1, 2], [false, true]);

assert.equal(changed, 1, "the visible text is found across parallel cache containers");
assert.equal(textRows[0].text, "Incomplete", "incomplete categories remain unchanged");
assert.equal(textRows[1].text, "<col=00ff00>Complete</col>");
assert.equal(textRows[1].text2, "<col=00ff00>Complete hover</col>");
assert.equal(textRows[1].textColor, COLLECTION_LOG_COMPLETE_COLOR);
assert.equal(textRows[1].mouseOverColor, COLLECTION_LOG_COMPLETE_COLOR);
assert.equal(clickRows[1].color, undefined, "click-row backgrounds are not recolored");
assert.deepEqual(new Set(invalidated), new Set([11]));

const previousCompletion = state.lastCollectionLogCategoryCompletion;
const replaySource = { 0: [false, true], 4: [true] };
state.lastCollectionLogCategoryCompletion = replaySource;
const replayed: CollectionLogServerPayload[] = [];
const unsubscribe = subscribeCollectionLog((update) => replayed.push(update));
unsubscribe();
state.lastCollectionLogCategoryCompletion = previousCompletion;
const completionReplay = replayed.find(
    (update) => update.kind === "category_completion",
);
assert.deepEqual(completionReplay, {
    kind: "category_completion",
    completionByTab: replaySource,
});
if (completionReplay?.kind === "category_completion") {
    assert.notEqual(
        completionReplay.completionByTab,
        replaySource,
        "subscriber replay must not expose the cached record by reference",
    );
    assert.notEqual(completionReplay.completionByTab[0], replaySource[0]);
}

state.lastCollectionLogSnapshot = [{ slot: 0, itemId: 1, quantity: 1 }];
state.lastCollectionLogCategoryCompletion = { 0: [true] };
disposeServerConnection("collection-log-test");
assert.equal(state.lastCollectionLogSnapshot, undefined);
assert.equal(
    state.lastCollectionLogCategoryCompletion,
    undefined,
    "completion state cannot leak into the next account after disconnect",
);

console.log("collection log completion tests passed");
