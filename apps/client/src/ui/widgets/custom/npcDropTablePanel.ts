import { NPC_DROP_TABLE_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";
import { createScrollController } from "@client/ui/widgets/uikit/ScrollController";

const ROW_HEIGHT = 34;

registerUiPanel({
    groupId: NPC_DROP_TABLE_PANEL_GROUP_ID,
    build: () =>
        buildUiPanel(NPC_DROP_TABLE_PANEL_GROUP_ID, {
            width: 520,
            height: 320,
            tabs: { position: "left", width: 116 },
            content: {
                rowKind: "icon",
                rowHeight: ROW_HEIGHT,
                scrollbarWidth: 16,
            },
        }),
    scrollController: createScrollController(NPC_DROP_TABLE_PANEL_GROUP_ID, "icon", ROW_HEIGHT),
});
