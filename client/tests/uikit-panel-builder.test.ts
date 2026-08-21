import assert from "node:assert/strict";

import { ComponentIds } from "../common/uikit/contracts";
import { buildUiPanel } from "../widgets/uikit/PanelBuilder";

const groupId = 31000;
const topTabs = buildUiPanel(groupId, {
    width: 520,
    height: 320,
    tabs: { position: "top" },
    content: { rowKind: "text", rowHeight: 18, scrollbarWidth: 16 },
    footerButton: true,
});

const uid = (componentId: number) => ((groupId & 0xffff) << 16) | componentId;
assert.ok(topTabs.root);
assert.equal(topTabs.widgets.get(uid(ComponentIds.CONTENT_VIEW))?.rawY, 62);
assert.equal(topTabs.widgets.get(uid(ComponentIds.TAB_BASE))?.isHidden, true);
assert.equal(topTabs.widgets.get(uid(ComponentIds.FOOTER_BUTTON))?.actions?.[0], "View");
assert.equal(topTabs.widgets.size, 1 + 1 + ComponentIds.MAX_TABS * 2 + 1 + ComponentIds.MAX_ROWS * 3 + 4);

assert.throws(
    () => buildUiPanel(-1, { width: 1, height: 1, content: { rowKind: "text", rowHeight: 1, scrollbarWidth: 0 } }),
    /groupId/,
);

const controls = buildUiPanel(groupId + 1, {
    width: 520, height: 240, controls: {},
    content: { rowKind: "text", rowHeight: 18, scrollbarWidth: 0 },
});
const controlsUid = (componentId: number) => (((groupId + 1) & 0xffff) << 16) | componentId;
assert.equal(controls.widgets.get(controlsUid(ComponentIds.CONTROL_BACKGROUND_BASE))?.actions?.[0], "Select");
assert.equal(controls.widgets.get(controlsUid(ComponentIds.CONTROL_LABEL_BASE))?.isHidden, true);
assert.throws(
    () => buildUiPanel(groupId + 3, {
        width: 1, height: 1, footerButton: true, controls: {},
        content: { rowKind: "text", rowHeight: 1, scrollbarWidth: 0 },
    }),
    /either footerButton or controls/,
);
assert.throws(
    () => buildUiPanel(groupId + 1, { width: 0, height: 1, content: { rowKind: "text", rowHeight: 1, scrollbarWidth: 0 } }),
    /dimensions/,
);

const searched = buildUiPanel(groupId + 2, {
    width: 300,
    height: 220,
    sidebar: { width: 80 },
    search: { placeholder: "Search entries" },
    content: { rowKind: "icon", rowHeight: 34, scrollbarWidth: 16 },
});
const searchedUid = (componentId: number) => (((groupId + 2) & 0xffff) << 16) | componentId;
assert.equal(searched.widgets.get(searchedUid(ComponentIds.CONTENT_VIEW))?.rawY, 66);
assert.equal(
    searched.widgets.get(searchedUid(ComponentIds.SEARCH_TEXT))?.text,
    "<col=8f7f66>Search entries</col>",
);
