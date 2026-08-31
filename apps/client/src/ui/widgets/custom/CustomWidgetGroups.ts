import { getDynamicWidgetGroup } from "@client/features/content/GamemodeContentStore";
import { SMITHING_BAR_MODAL_GROUP_ID } from "@august/protocol/ui/widgets";
import type { WidgetNode } from "@client/ui/widgets/WidgetNode";
import { getRegisteredUiPanel } from "@client/ui/widgets/uikit/registry";
// Imported for their module-load-time registerUiPanel(...) side effects -
// see @client/ui/widgets/uikit/registry. Not called directly here. This is
// the ONLY place these panel files need to be referenced at all - adding
// a new UI-kit-built panel means writing its own file and adding one
// import line here, not editing dispatch logic.
import "@client/ui/widgets/custom/skillGuidePanel";
import "@client/ui/widgets/custom/questJournalPanel";
import "@client/ui/widgets/custom/diaryPanel";
import "@client/ui/widgets/custom/devUIKitPanels";
import "@client/ui/widgets/custom/npcDropTablePanel";
import "@client/ui/widgets/custom/npcAnimationReviewPanel";
import "@client/ui/widgets/custom/transportObjectPanel";
import "@client/ui/widgets/custom/digPanel";
import "@client/ui/widgets/custom/rewardDisplayPanel";
import { buildSmithingBarModalGroup } from "@client/ui/widgets/custom/smithing.cs2";

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
