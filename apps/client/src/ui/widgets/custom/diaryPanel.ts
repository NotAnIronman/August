import { ACHIEVEMENT_DIARY_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";
import { createScrollController } from "@client/ui/widgets/uikit/ScrollController";

/**
 * Achievement diary, rebuilt with the UI kit. Same sidebar-tabs +
 * scrollable-text-content shape as skill guide, just with a fixed set of
 * 4 tabs (Easy/Medium/Hard/Elite) instead of data-driven ones.
 */
export const DIARY_ROW_HEIGHT = 18;

const scrollController = createScrollController(
    ACHIEVEMENT_DIARY_PANEL_GROUP_ID,
    "text",
    DIARY_ROW_HEIGHT,
);

registerUiPanel({
    groupId: ACHIEVEMENT_DIARY_PANEL_GROUP_ID,
    build: () => buildUiPanel(ACHIEVEMENT_DIARY_PANEL_GROUP_ID, {
        width: 520,
        height: 320,
        tabs: { position: "left", width: 116 },
        content: {
            rowKind: "text",
            rowHeight: DIARY_ROW_HEIGHT,
            scrollbarWidth: 16,
        },
    }),
    scrollController,
});
