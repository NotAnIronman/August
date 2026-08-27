import assert from "node:assert/strict";

import { ComponentIds } from "../common/uikit/contracts";
import { buildUiPanel } from "../widgets/uikit/PanelBuilder";
import { inspectUiPanel } from "../widgets/uikit/PanelTestHarness";
import { wrapTextToLines } from "../widgets/uikit/textMarkup";

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
assert.equal(topTabs.root?.noClickThrough, true);
assert.equal(
    topTabs.widgets.get(uid(ComponentIds.FOOTER_BUTTON_LABEL))?.parentUid,
    uid(ComponentIds.ROOT),
);
assert.equal(topTabs.widgets.size, 1 + 1 + ComponentIds.MAX_TABS * 3 + 1 + ComponentIds.MAX_ROWS * 3 + 2);
assert.equal(
    topTabs.widgets.get(uid(ComponentIds.TAB_BACKGROUND_BASE))?.cacheUiAsset,
    "ui.tab-base",
);
assert.equal(
    topTabs.widgets.get(uid(ComponentIds.TAB_HIGHLIGHT_BASE))?.cacheUiAsset,
    "ui.tab-hover",
);
assert.ok(ComponentIds.TAB_BACKGROUND_BASE < ComponentIds.TAB_BASE);
assert.ok(ComponentIds.TAB_HIGHLIGHT_BASE < ComponentIds.TAB_BASE);

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

// Markup consumes source characters but no screen width. A 79-character
// coloured journal line must therefore stay on one 80-character visual line.
const styledJournalLine = `<col=ff0000>${Array.from({ length: 16 }, () => "four").join(" ")}</col>`;
assert.equal(wrapTextToLines(styledJournalLine, 80).length, 1);

const mixedMenu = buildUiPanel(groupId + 4, {
    width: 520,
    height: 320,
    inputCapture: true,
    content: { rowKind: "mixed", rowHeight: 34, scrollbarWidth: 16 },
    menuButtons: { columns: 2 },
});
const mixedMenuHarness = inspectUiPanel(mixedMenu, groupId + 4);
assert.equal(mixedMenuHarness.capturesPointer(), true);
assert.equal(mixedMenuHarness.has(ComponentIds.TEXT_ROW_LINE_BASE), true);
assert.equal(mixedMenuHarness.has(ComponentIds.ICON_ROW_ICON_BASE), true);
assert.equal(mixedMenuHarness.menuButtonCount(), ComponentIds.MAX_MENU_BUTTONS);
assert.equal(
    mixedMenuHarness.parentOf(ComponentIds.MENU_BUTTON_LABEL_BASE),
    ((groupId + 4) << 16) | ComponentIds.CONTENT_VIEW,
);
