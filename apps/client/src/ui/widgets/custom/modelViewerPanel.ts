import { DEV_MODEL_VIEWER_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { sendChat } from "@client/core/network/server-connection/outgoing/inventoryChat";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { createSearchController } from "@client/ui/widgets/uikit/SearchController";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";

/**
 * Cache scenery is best reviewed in the actual scene renderer rather than a
 * synthetic thumbnail: model transforms, lighting, and animation variants
 * remain exactly as they will appear in-game.
 */
registerUiPanel({
    groupId: DEV_MODEL_VIEWER_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_MODEL_VIEWER_PANEL_GROUP_ID, {
        width: 370,
        height: 168,
        content: { rowKind: "mixed", rowHeight: 34, scrollbarWidth: 0 },
        footerButton: true,
        search: { placeholder: "Object ID — Enter", width: 230 },
        inputCapture: false,
    }),
    searchController: createSearchController(
        DEV_MODEL_VIEWER_PANEL_GROUP_ID,
        "Object ID — Enter",
        () => {},
        (query) => {
            const id = query.trim();
            if (/^\d+$/.test(id)) sendChat(`::modelviewer ${id}`);
        },
        8,
    ),
});
