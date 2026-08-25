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

const journalLayout = {
    width: 520,
    height: 300,
    content: {
        rowKind: "text" as const,
        rowHeight: QUEST_JOURNAL_ROW_HEIGHT,
        scrollbarWidth: 16,
    },
    infoColumn: {
        width: 172,
        rowHeight: QUEST_JOURNAL_ROW_HEIGHT,
    },
    footerButton: true,
};

const overviewLayout = {
    width: 520,
    height: 300,
    content: {
        rowKind: "text" as const,
        rowHeight: QUEST_JOURNAL_ROW_HEIGHT,
        scrollbarWidth: 16,
    },
    footerButton: true,
};

const questJournalScrollController = createScrollController(
    QUEST_JOURNAL_PANEL_GROUP_ID,
    "text",
    QUEST_JOURNAL_ROW_HEIGHT,
);
const questOverviewScrollController = createScrollController(
    QUEST_OVERVIEW_PANEL_GROUP_ID,
    "text",
    QUEST_JOURNAL_ROW_HEIGHT,
);

registerUiPanel({
    groupId: QUEST_JOURNAL_PANEL_GROUP_ID,
    build: () => buildUiPanel(QUEST_JOURNAL_PANEL_GROUP_ID, journalLayout),
    scrollController: questJournalScrollController,
});
registerUiPanel({
    groupId: QUEST_OVERVIEW_PANEL_GROUP_ID,
    build: () => buildUiPanel(QUEST_OVERVIEW_PANEL_GROUP_ID, overviewLayout),
    scrollController: questOverviewScrollController,
});
