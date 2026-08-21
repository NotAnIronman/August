import { getDynamicWidgetGroup } from "../../common/gamemode/GamemodeContentStore";
import { SMITHING_BAR_MODAL_GROUP_ID } from "../../common/ui/widgets";
import type { WidgetNode } from "../WidgetNode";
import { getRegisteredUiPanel } from "../uikit/registry";
// Imported for their module-load-time registerUiPanel(...) side effects -
// see client/widgets/uikit/registry.ts. Not called directly here. This is
// the ONLY place these panel files need to be referenced at all - adding
// a new UI-kit-built panel means writing its own file and adding one
// import line here, not editing dispatch logic.
import "./skillGuidePanel";
import "./questJournalPanel";
import "./diaryPanel";
import "./devUIKitPanels";
import { buildSmithingBarModalGroup } from "./smithing.cs2";

type WidgetGroupLoadResult = { root: WidgetNode | undefined; widgets: Map<number, WidgetNode> };

export function loadCustomWidgetGroup(groupId: number): WidgetGroupLoadResult | undefined {
    const normalizedGroupId = groupId | 0;

    const registered = getRegisteredUiPanel(normalizedGroupId);
    if (registered) {
        return registered;
    }

    if (normalizedGroupId === SMITHING_BAR_MODAL_GROUP_ID) {
        return buildSmithingBarModalGroup();
    }
    // Check dynamically loaded widgets (from GAMEMODE_DATA)
    const dynamic = getDynamicWidgetGroup(groupId);
    if (dynamic) {
        return dynamic as WidgetGroupLoadResult;
    }
    return undefined;
}
