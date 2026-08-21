import { getDynamicWidgetGroup } from "../../common/gamemode/GamemodeContentStore";
import {
    ACHIEVEMENT_DIARY_PANEL_GROUP_ID,
    QUEST_JOURNAL_PANEL_GROUP_ID,
    QUEST_OVERVIEW_PANEL_GROUP_ID,
    SMITHING_BAR_MODAL_GROUP_ID,
} from "../../common/ui/widgets";
import type { WidgetNode } from "../WidgetNode";
import { getRegisteredUiPanel } from "../uikit/registry";
import { buildDiaryTabbedGroup } from "./diaryTabbed.cs2";
import { buildJournalPanelGroup } from "./journalPanel.cs2";
// Imported for its module-load-time registerUiPanel(...) side effect -
// see client/widgets/uikit/registry.ts. Not called directly here.
import "./skillGuidePanel";
import { buildSmithingBarModalGroup } from "./smithing.cs2";

type WidgetGroupLoadResult = { root: WidgetNode | undefined; widgets: Map<number, WidgetNode> };

// Panels migrated to the UI kit (client/widgets/uikit/) register
// themselves via registerUiPanel() and are checked first - see
// skillGuidePanel.ts for the pattern. Panels below this point are the
// old per-panel implementations, still pending migration.
//
// Note: ACHIEVEMENT_DIARY_PANEL_GROUP_ID is NOT in JOURNAL_PANEL_GROUP_IDS
// - it uses its own tabbed builder below, not the flat journal-panel
// layout.
const JOURNAL_PANEL_GROUP_IDS = new Set<number>([
    QUEST_JOURNAL_PANEL_GROUP_ID,
    QUEST_OVERVIEW_PANEL_GROUP_ID,
]);

export function loadCustomWidgetGroup(groupId: number): WidgetGroupLoadResult | undefined {
    const normalizedGroupId = groupId | 0;

    const registered = getRegisteredUiPanel(normalizedGroupId);
    if (registered) {
        return registered;
    }

    if (normalizedGroupId === SMITHING_BAR_MODAL_GROUP_ID) {
        return buildSmithingBarModalGroup();
    }
    if (normalizedGroupId === ACHIEVEMENT_DIARY_PANEL_GROUP_ID) {
        return buildDiaryTabbedGroup(normalizedGroupId);
    }
    if (JOURNAL_PANEL_GROUP_IDS.has(normalizedGroupId)) {
        return buildJournalPanelGroup(normalizedGroupId);
    }
    // Check dynamically loaded widgets (from GAMEMODE_DATA)
    const dynamic = getDynamicWidgetGroup(groupId);
    if (dynamic) {
        return dynamic as WidgetGroupLoadResult;
    }
    return undefined;
}
