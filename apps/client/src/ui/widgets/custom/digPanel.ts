import { DEV_DIG_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { ComponentIds } from "@august/protocol/uikit/contracts";
import { sendChat } from "@client/core/network/server-connection/outgoing/inventoryChat";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { createGalleryClickController } from "@client/ui/widgets/uikit/GalleryClickController";
import { createSearchController, type UiSearchController } from "@client/ui/widgets/uikit/SearchController";
import { createScrollController } from "@client/ui/widgets/uikit/ScrollController";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";

let search: UiSearchController | undefined;
let lastActivationHidden: boolean | undefined;

registerUiPanel({
    groupId: DEV_DIG_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_DIG_PANEL_GROUP_ID, {
        width: 640, height: 430,
        content: { rowKind: "text", rowHeight: 20, scrollbarWidth: 16, clickableRows: true, inlineRowActions: true },
        controls: { count: 2, width: 92, height: 28, gap: 6 },
        search: { placeholder: "Enter the requested value, then press Enter", width: 280, label: "Input:", labelWidth: 100 },
    }),
    scrollController: createScrollController(DEV_DIG_PANEL_GROUP_ID, "text", 20),
    searchController: (() => {
        const controller = createSearchController(DEV_DIG_PANEL_GROUP_ID, "Enter the requested value, then press Enter", () => {}, (value) => {
            search?.setQuery("", true);
            sendChat(`::dig input ${value.trim()}`);
        }, 120);
        search = controller;
        return controller;
    })(),
    galleryClickController: createGalleryClickController(
        DEV_DIG_PANEL_GROUP_ID, ComponentIds.MAX_ROWS, ComponentIds.DIALOGUE_ROW_HITZONE_BASE,
        (row) => String(row),
        (row) => sendChat(`::dig selectrow ${row}`),
        (row) => sendChat(`::dig editrow ${row}`),
    ),
    onProcess: (widgetManager) => {
        const uid = ((DEV_DIG_PANEL_GROUP_ID & 0xffff) << 16) | ComponentIds.DIALOGUE_ACTIVATE_SIGNAL;
        const hidden = widgetManager.getWidgetByUid(uid)?.hidden as boolean | undefined;
        if (hidden === false && lastActivationHidden !== false) search?.setQuery("", true);
        lastActivationHidden = hidden;
    },
});
