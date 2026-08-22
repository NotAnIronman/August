import {
    DEV_UIKIT_COMPONENTS_PANEL_GROUP_ID,
    DEV_UIKIT_ICON_PANEL_GROUP_ID,
    DEV_UIKIT_MENU_PANEL_GROUP_ID,
    DEV_UIKIT_TEXT_PANEL_GROUP_ID,
} from "../../common/ui/widgets/custom/journalPanel.cs2";
import { buildUiPanel } from "../uikit/PanelBuilder";
import { ComponentIds } from "../../common/uikit/contracts";
import { createSearchController } from "../uikit/SearchController";
import { registerUiPanel } from "../uikit/registry";
import { createScrollController } from "../uikit/ScrollController";

const TEXT_ROW_HEIGHT = 18;
const ICON_ROW_HEIGHT = 34;

function filterDevTextRows(query: string, widgetManager: any): void {
    const normalizedQuery = query.trim().toLowerCase();
    const uid = (componentId: number) =>
        ((DEV_UIKIT_TEXT_PANEL_GROUP_ID & 0xffff) << 16) | componentId;
    let visibleRowIndex = 0;
    for (let index = 0; index < ComponentIds.MAX_ROWS; index++) {
        const line = widgetManager.getWidgetByUid(uid(ComponentIds.TEXT_ROW_LINE_BASE + index));
        const centered = widgetManager.getWidgetByUid(uid(ComponentIds.TEXT_ROW_CENTER_BASE + index));
        const divider = widgetManager.getWidgetByUid(uid(ComponentIds.TEXT_ROW_DIVIDER_BASE + index));
        const text = `${line?.text ?? ""} ${centered?.text ?? ""}`
            .replace(/<[^>]+>/g, "")
            .toLowerCase();
        const matches = !normalizedQuery || text.includes(normalizedQuery);
        for (const widget of [line, centered]) {
            if (!widget) continue;
            if (widget.__uikitBaseHidden === undefined) widget.__uikitBaseHidden = !!widget.hidden;
            widget.hidden = widget.__uikitBaseHidden || !matches;
            widget.isHidden = widget.hidden;
            if (widget.__uikitBaseRawY === undefined) widget.__uikitBaseRawY = widget.rawY;
            widget.rawY = matches ? visibleRowIndex * TEXT_ROW_HEIGHT : widget.__uikitBaseRawY;
            widget.y = widget.rawY;
            widgetManager.invalidateWidgetRender(widget);
        }
        if (divider) {
            if (divider.__uikitBaseHidden === undefined) divider.__uikitBaseHidden = !!divider.hidden;
            divider.hidden = divider.__uikitBaseHidden || !matches;
            divider.isHidden = divider.hidden;
            if (divider.__uikitBaseRawY === undefined) divider.__uikitBaseRawY = divider.rawY;
            divider.rawY = matches
                ? visibleRowIndex * TEXT_ROW_HEIGHT + Math.floor(TEXT_ROW_HEIGHT / 2) - 1
                : divider.__uikitBaseRawY;
            divider.y = divider.rawY;
            widgetManager.invalidateWidgetRender(divider);
        }
        if ([line, centered, divider].some((widget) => widget && !widget.hidden)) {
            visibleRowIndex++;
        }
    }
    const content = widgetManager.getWidgetByUid(uid(ComponentIds.CONTENT_VIEW));
    if (content) {
        content.scrollHeight = Math.max(content.height, visibleRowIndex * TEXT_ROW_HEIGHT);
        widgetManager.invalidateScroll(content);
    }
}

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
        filterDevTextRows,
    ),
});

registerUiPanel({
    groupId: DEV_UIKIT_MENU_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_UIKIT_MENU_PANEL_GROUP_ID, {
        width: 560,
        height: 390,
        content: { rowKind: "mixed", rowHeight: 34, scrollbarWidth: 0 },
        menuButtons: {
            columns: 2, rows: 4, buttonHeight: 58, gap: 8, iconSize: 40, maxHeightFraction: 0.5,
        },
        footerButton: true,
    }),
});

// This launcher deliberately opens cache-defined interfaces rather than copying
// their assets. It lets developers inspect their real component hierarchy and
// choose an exact source component for a later UIKit skin.
registerUiPanel({
    groupId: DEV_UIKIT_COMPONENTS_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_UIKIT_COMPONENTS_PANEL_GROUP_ID, {
        width: 560,
        height: 390,
        content: { rowKind: "mixed", rowHeight: 34, scrollbarWidth: 0 },
        menuButtons: {
            columns: 2, rows: 2, buttonHeight: 86, gap: 10, iconSize: 40, maxHeightFraction: 0.5,
        },
        footerButton: true,
    }),
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
