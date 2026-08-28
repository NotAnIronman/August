import { NPC_ANIMATION_REVIEW_PANEL_GROUP_ID } from "../../common/ui/widgets/custom/journalPanel.cs2";
import { sendChat } from "../../network/serverConnection/outgoing/inventoryChat";
import { buildUiPanel } from "../uikit/PanelBuilder";
import { createSearchController } from "../uikit/SearchController";
import { registerUiPanel } from "../uikit/registry";

/**
 * A compact, persistent button grid for reviewing NPC animation candidates.
 * The labels and item icons are sent by the server; every click is validated
 * there before it can save a combat definition.
 */
registerUiPanel({
    groupId: NPC_ANIMATION_REVIEW_PANEL_GROUP_ID,
    build: () =>
        buildUiPanel(NPC_ANIMATION_REVIEW_PANEL_GROUP_ID, {
            // Keep the test NPC visible behind the panel. This is a compact
            // developer palette, not a full-screen game interface.
            width: 360,
            height: 292,
            content: { rowKind: "mixed", rowHeight: 34, scrollbarWidth: 0 },
            menuButtons: {
                columns: 3,
                rows: 4,
                buttonHeight: 36,
                gap: 4,
                iconSize: 26,
                maxHeightFraction: 0.78,
                maxWidthFraction: 0.9,
                backgroundAsset: "cache.sprite.293.0",
                backgroundHoverAsset: "cache.sprite.294.0",
            },
            footerButton: true,
            search: { placeholder: "NPC ID — Enter to load", width: 200 },
            inputCapture: false,
        }),
    searchController: createSearchController(
        NPC_ANIMATION_REVIEW_PANEL_GROUP_ID,
        "NPC ID — Enter to load",
        () => {},
        (query) => {
            const npcId = query.trim();
            // Keep client input deliberately narrow. The server's existing
            // ::npcreview command remains the authority for cache validation
            // and for replacing the prior private preview NPC.
            if (!/^\d+$/.test(npcId)) return;
            sendChat(`::npcreview ${npcId}`);
        },
        8,
    ),
});
