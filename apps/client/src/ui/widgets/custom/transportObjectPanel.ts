import { DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { ComponentIds } from "@august/protocol/uikit/contracts";
import { sendChat } from "@client/core/network/server-connection/outgoing/inventoryChat";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { createSearchController } from "@client/ui/widgets/uikit/SearchController";
import { createScrollController } from "@client/ui/widgets/uikit/ScrollController";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";
import { createGalleryClickController } from "@client/ui/widgets/uikit/GalleryClickController";

const ROW_HEIGHT = 20;
const rowRef = (index: number): string | undefined => String(index);
let searchController: ReturnType<typeof createSearchController> | undefined;
let lastActivationHidden: boolean | undefined;

registerUiPanel({
    groupId: DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, {
        width: 640,
        height: 430,
        content: { rowKind: "text", rowHeight: ROW_HEIGHT, scrollbarWidth: 16, clickableRows: true, inlineRowActions: true },
        controls: { count: 2, width: 92, height: 28, gap: 6 },
        search: { placeholder: "Enter the requested value, then press Enter", width: 280, label: "Input:", labelWidth: 100 },
    }),
    scrollController: createScrollController(DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, "text", ROW_HEIGHT),
    searchController: (() => {
        const controller = createSearchController(
        DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID,
        "Enter the requested value, then press Enter",
        () => {},
        (value) => {
            const text = value.trim();
            // Keep authoring continuous: Enter clears the previous field and
            // retains focus while the server advances the wizard.
            searchController?.setQuery("", true);
            sendChat(`::to input ${text}`);
        },
            120,
        );
        searchController = controller;
        return controller;
    })(),
    galleryClickController: createGalleryClickController(
        DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID,
        ComponentIds.MAX_ROWS,
        ComponentIds.DIALOGUE_ROW_HITZONE_BASE,
        rowRef,
        (row) => sendChat(`::to selectrow ${row}`),
        (row) => sendChat(`::to editrow ${row}`),
    ),
    onProcess: (widgetManager) => {
        const uid = ((DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID & 0xffff) << 16) | ComponentIds.DIALOGUE_ACTIVATE_SIGNAL;
        const hidden = widgetManager.getWidgetByUid(uid)?.hidden as boolean | undefined;
        if (hidden === false && lastActivationHidden !== false) searchController?.setQuery("", true);
        lastActivationHidden = hidden;
    },
});
