import { ACHIEVEMENT_DIARY_PANEL_GROUP_ID } from "../../common/ui/widgets/custom/journalPanel.cs2";
import { buildUiPanel } from "../uikit/PanelBuilder";
import { registerUiPanel } from "../uikit/registry";
import { createScrollController } from "../uikit/ScrollController";

/**
 * Achievement diary, rebuilt with the UI kit. Same sidebar-tabs +
 * scrollable-text-content shape as skill guide, just with a fixed set of
 * 4 tabs (Easy/Medium/Hard/Elite) instead of data-driven ones.
 */
export const DIARY_ROW_HEIGHT = 18;

registerUiPanel(ACHIEVEMENT_DIARY_PANEL_GROUP_ID, () =>
    buildUiPanel(ACHIEVEMENT_DIARY_PANEL_GROUP_ID, {
        width: 520,
        height: 320,
        sidebar: { width: 116 },
        content: {
            rowKind: "text",
            rowHeight: DIARY_ROW_HEIGHT,
            scrollbarWidth: 16,
        },
    }),
);

/** Wired into WidgetInputController.ts. */
export const diaryScrollController = createScrollController(
    ACHIEVEMENT_DIARY_PANEL_GROUP_ID,
    "text",
    DIARY_ROW_HEIGHT,
);
