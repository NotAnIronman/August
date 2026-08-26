import { NPC_ANIMATION_REVIEW_PANEL_GROUP_ID } from "../../common/ui/widgets/custom/journalPanel.cs2";
import { buildUiPanel } from "../uikit/PanelBuilder";
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
            width: 520,
            height: 390,
            content: { rowKind: "mixed", rowHeight: 34, scrollbarWidth: 0 },
            menuButtons: {
                columns: 2,
                rows: 4,
                buttonHeight: 58,
                gap: 8,
                iconSize: 36,
                maxHeightFraction: 0.78,
                maxWidthFraction: 0.82,
                backgroundAsset: "cache.sprite.293.0",
                backgroundHoverAsset: "cache.sprite.294.0",
            },
            footerButton: true,
        }),
});
