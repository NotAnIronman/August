import {
    DEV_UIKIT_ICON_PANEL_GROUP_ID,
    DEV_UIKIT_TEXT_PANEL_GROUP_ID,
} from "../../common/ui/widgets/custom/journalPanel.cs2";
import { buildUiPanel } from "../uikit/PanelBuilder";
import { createSearchController } from "../uikit/SearchController";
import { registerUiPanel } from "../uikit/registry";
import { createScrollController } from "../uikit/ScrollController";

const TEXT_ROW_HEIGHT = 18;
const ICON_ROW_HEIGHT = 34;

// This temporary developer-only panel deliberately exercises the complete
// UIKit surface. Text/icon rows and footer/controls are alternative layouts,
// so they are shown on two screens navigated from the same ::Dev entry point.
registerUiPanel({
    groupId: DEV_UIKIT_TEXT_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_UIKIT_TEXT_PANEL_GROUP_ID, {
        width: 560,
        height: 360,
        tabs: { position: "left", width: 124 },
        content: { rowKind: "text", rowHeight: TEXT_ROW_HEIGHT, scrollbarWidth: 16 },
        controls: { width: 108, height: 20, gap: 8 },
        search: { placeholder: "Search is a local UIKit input", width: 360 },
    }),
    scrollController: createScrollController(
        DEV_UIKIT_TEXT_PANEL_GROUP_ID,
        "text",
        TEXT_ROW_HEIGHT,
    ),
    searchController: createSearchController(
        DEV_UIKIT_TEXT_PANEL_GROUP_ID,
        "Search is a local UIKit input",
        () => {},
    ),
});

registerUiPanel({
    groupId: DEV_UIKIT_ICON_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_UIKIT_ICON_PANEL_GROUP_ID, {
        width: 560,
        height: 360,
        tabs: { position: "top", height: 22 },
        content: { rowKind: "icon", rowHeight: ICON_ROW_HEIGHT, scrollbarWidth: 16 },
        footerButton: true,
    }),
    scrollController: createScrollController(
        DEV_UIKIT_ICON_PANEL_GROUP_ID,
        "icon",
        ICON_ROW_HEIGHT,
    ),
});
