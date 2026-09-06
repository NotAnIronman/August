import { SLAYER_REWARDS_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";
import { createScrollController } from "@client/ui/widgets/uikit/ScrollController";

/**
 * Slayer Rewards panel — 4 tabs (Unlock / Extend / Buy / Tasks), styled to
 * resemble the real Slayer Rewards interface (which this client has no
 * rendering support for at all — checked before building this).
 *
 * Deliberately `rowKind: "text"` with `clickableRows: true`, NOT "icon".
 * Row click-zones (DIALOGUE_ROW_HITZONE_BASE) are only ever created for
 * "text"/"mixed" content in PanelBuilder.ts's row-building loop — a
 * previous attempt paired clickableRows with a pure "icon" row panel
 * (whose hitzone widgets are never built), and additionally never
 * registered this file at all, so the group id had no widget tree
 * whatsoever. Opening a nonexistent/half-built modal corrupted the
 * client's interaction state entirely. This follows the exact proven
 * combination already used by the Dialogue Tree Editor
 * (devUIKitPanels.ts's DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID) instead of a
 * novel, untested one.
 *
 * `tabs.position: "top"` matches the real interface's horizontal tab bar
 * (Unlock/Extend/Buy/Tasks along the top, per the reference screenshots).
 */
const REWARD_ROW_HEIGHT = 30;

const scrollController = createScrollController(
    SLAYER_REWARDS_PANEL_GROUP_ID,
    "text",
    REWARD_ROW_HEIGHT,
);

registerUiPanel({
    groupId: SLAYER_REWARDS_PANEL_GROUP_ID,
    build: () =>
        buildUiPanel(SLAYER_REWARDS_PANEL_GROUP_ID, {
            width: 480,
            height: 360,
            tabs: { position: "top" },
            content: {
                rowKind: "text",
                rowHeight: REWARD_ROW_HEIGHT,
                scrollbarWidth: 16,
                clickableRows: true,
            },
        }),
    scrollController,
});
