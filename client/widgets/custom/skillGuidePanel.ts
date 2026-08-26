import { SKILL_GUIDE_PANEL_GROUP_ID } from "../../common/ui/widgets/custom/journalPanel.cs2";
import { buildUiPanel } from "../uikit/PanelBuilder";
import { registerUiPanel } from "../uikit/registry";
import { createScrollController } from "../uikit/ScrollController";

/**
 * Skill guide, rebuilt with the UI kit (see client/widgets/uikit/).
 *
 * This replaces the old hand-built skillGuideTabbed.cs2.ts - same visual
 * result (sidebar tabs + level/icon/name/description rows + scrollbar),
 * but built from the shared, reusable kit instead of its own one-off
 * copy of the frame/tabs/scroll logic. Any future fix to the kit (e.g.
 * another scrollbar edge case) now fixes this panel automatically.
 */
/** Compact item line plus a wrap-enabled requirement field. */
export const SKILL_GUIDE_ROW_HEIGHT = 40;

const scrollController = createScrollController(
    SKILL_GUIDE_PANEL_GROUP_ID,
    "icon",
    SKILL_GUIDE_ROW_HEIGHT,
);

registerUiPanel({
    groupId: SKILL_GUIDE_PANEL_GROUP_ID,
    build: () => buildUiPanel(SKILL_GUIDE_PANEL_GROUP_ID, {
        width: 520,
        height: 320,
        tabs: { position: "left", width: 116, textAlignment: "center" },
        content: {
            rowKind: "icon",
            rowHeight: SKILL_GUIDE_ROW_HEIGHT,
            scrollbarWidth: 16,
            iconRowNameHeight: 15,
            iconRowDescriptionHeight: 25,
            iconRowAlternateBackground: true,
        },
    }),
    scrollController,
});
