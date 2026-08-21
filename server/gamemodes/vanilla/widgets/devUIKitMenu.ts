import {
    DEV_UIKIT_ICON_PANEL_GROUP_ID,
    DEV_UIKIT_TEXT_PANEL_GROUP_ID,
} from "../../../../client/common/ui/widgets/custom/journalPanel.cs2";
import { ComponentIds, type UiIconRow, type UiTextRow } from "../../../../client/common/uikit/contracts";
import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { registerUiPanelActions } from "../uikit/actions";
import {
    openUiPanel,
    sendUiControls,
    sendUiFooterButton,
    sendUiIconRows,
    sendUiTabs,
    sendUiTextRows,
} from "../uikit/panelData";

const TEXT_TABS = [
    { label: "Text rows" },
    { label: "Controls" },
    { label: "Search" },
];

const TEXT_ROWS: readonly UiTextRow[] = [
    { kind: "heading", text: "UIKit developer menu", style: { color: "ffcf70", bold: true } },
    { kind: "text", text: "This is a temporary component showcase.", align: "center" },
    { kind: "divider" },
    { kind: "text", text: "Standard left-aligned text row." },
    { kind: "text", text: "Styled text row.", style: { color: "80d8ff", bold: true } },
    { kind: "text", text: "Strikethrough text row.", style: { strikethrough: true } },
    { kind: "spacer" },
    { kind: "text", text: "Use the scrollbar to confirm scrolling behavior." },
    ...Array.from({ length: 18 }, (_, index): UiTextRow => ({
        kind: "text",
        text: `Scrollable test row ${index + 1}`,
    })),
];

const ICON_ROWS: readonly UiIconRow[] = [
    { level: 1, itemId: 4151, name: "Icon row", description: "Item icon, level, title, and description." },
    { level: 2, itemId: 995, name: "Second item", description: "A second UIKit icon row." },
    { level: 3, itemId: 554, name: "Transparency", description: "This item is partially transparent.", transparency: 80 },
    ...Array.from({ length: 12 }, (_, index): UiIconRow => ({
        level: index + 4,
        itemId: 556,
        name: `Scrollable icon row ${index + 1}`,
        description: "Temporary developer menu content.",
    })),
];

function openTextMenu(player: PlayerState, services: ScriptServices): void {
    openUiPanel(services, player, DEV_UIKIT_TEXT_PANEL_GROUP_ID, "Developer UIKit Test");
    sendUiTabs(services, player.id, DEV_UIKIT_TEXT_PANEL_GROUP_ID, TEXT_TABS, 0);
    sendUiTextRows(services, player.id, DEV_UIKIT_TEXT_PANEL_GROUP_ID, TEXT_ROWS);
    sendUiControls(services, player.id, DEV_UIKIT_TEXT_PANEL_GROUP_ID, [
        { label: "Icon rows" },
        { label: "Refresh" },
    ]);
}

function openIconMenu(player: PlayerState, services: ScriptServices, activeTab = 0): void {
    openUiPanel(services, player, DEV_UIKIT_ICON_PANEL_GROUP_ID, "Developer UIKit Icons");
    sendUiTabs(
        services,
        player.id,
        DEV_UIKIT_ICON_PANEL_GROUP_ID,
        [{ label: "Items" }, { label: "Assets" }, { label: "Scroll" }],
        activeTab,
    );
    sendUiIconRows(services, player.id, DEV_UIKIT_ICON_PANEL_GROUP_ID, ICON_ROWS);
    sendUiFooterButton(services, player.id, DEV_UIKIT_ICON_PANEL_GROUP_ID, "Back to text rows");
}

/** Registers the developer-only ::Dev UIKit component showcase. */
export function registerDevUIKitMenu(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    registry.registerCommand("dev", ({ player }) => {
        openTextMenu(player, services);
    });

    registerUiPanelActions(registry, services, DEV_UIKIT_TEXT_PANEL_GROUP_ID, [
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE,
            actionId: "show_icon_rows",
            handle: ({ player }) => openIconMenu(player, services),
        },
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 1,
            actionId: "refresh_text_rows",
            handle: ({ player }) => openTextMenu(player, services),
        },
    ]);

    registerUiPanelActions(registry, services, DEV_UIKIT_ICON_PANEL_GROUP_ID, [
        {
            componentId: ComponentIds.FOOTER_BUTTON,
            actionId: "show_text_rows",
            handle: ({ player }) => openTextMenu(player, services),
        },
        ...[0, 1, 2].map((tabIndex) => ({
            componentId: ComponentIds.TAB_BASE + tabIndex,
            actionId: `select_icon_tab_${tabIndex}`,
            handle: ({ player }: { player: PlayerState }) => openIconMenu(player, services, tabIndex),
        })),
    ]);
}
