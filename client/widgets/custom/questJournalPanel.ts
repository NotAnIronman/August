import {
    QUEST_JOURNAL_PANEL_GROUP_ID,
    QUEST_OVERVIEW_PANEL_GROUP_ID,
} from "../../common/ui/widgets/custom/journalPanel.cs2";
import { buildUiPanel } from "../uikit/PanelBuilder";
import { registerUiPanel } from "../uikit/registry";
import { createScrollController } from "../uikit/ScrollController";

/**
 * Quest journal + quest overview, rebuilt with the UI kit. Structurally
 * identical panels (text rows, no sidebar, a "switch view" footer
 * button toggling between them) - one file registers both instead of
 * two near-duplicate ones.
 */
export const QUEST_JOURNAL_ROW_HEIGHT = 18;

const layout = {
    width: 520,
    height: 300,
    content: {
        rowKind: "text" as const,
        rowHeight: QUEST_JOURNAL_ROW_HEIGHT,
        scrollbarWidth: 16,
    },
    footerButton: true,
};

registerUiPanel(QUEST_JOURNAL_PANEL_GROUP_ID, () =>
    buildUiPanel(QUEST_JOURNAL_PANEL_GROUP_ID, layout),
);
registerUiPanel(QUEST_OVERVIEW_PANEL_GROUP_ID, () =>
    buildUiPanel(QUEST_OVERVIEW_PANEL_GROUP_ID, layout),
);

/** Wired into WidgetInputController.ts. */
export const questJournalScrollController = createScrollController(
    QUEST_JOURNAL_PANEL_GROUP_ID,
    "text",
    QUEST_JOURNAL_ROW_HEIGHT,
);
export const questOverviewScrollController = createScrollController(
    QUEST_OVERVIEW_PANEL_GROUP_ID,
    "text",
    QUEST_JOURNAL_ROW_HEIGHT,
);
