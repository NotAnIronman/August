import {
    DEV_UIKIT_ICON_PANEL_GROUP_ID,
    DEV_UIKIT_MENU_PANEL_GROUP_ID,
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
    sendUiMenuButtons,
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

function openTextMenu(player: PlayerState, services: ScriptServices, activeTab = 0): void {
    openUiPanel(services, player, DEV_UIKIT_TEXT_PANEL_GROUP_ID, "Developer UIKit Test");
    sendUiTabs(services, player.id, DEV_UIKIT_TEXT_PANEL_GROUP_ID, TEXT_TABS, activeTab);
    const tabRows: readonly UiTextRow[] =
        activeTab === 1
            ? [
                  { kind: "heading", text: "Controls", style: { color: "ffcf70", bold: true } },
                  { kind: "text", text: "The buttons below are server-authoritative." },
                  { kind: "divider" },
                  { kind: "text", text: "Icon rows opens the alternate UIKit layout." },
                  { kind: "text", text: "Refresh redraws this developer screen." },
              ]
            : activeTab === 2
              ? [
                    { kind: "heading", text: "Search", style: { color: "ffcf70", bold: true } },
                    { kind: "text", text: "Click the search field and type to verify local text input." },
                    { kind: "divider" },
                    { kind: "text", text: "Search is intentionally local for this prototype." },
                ]
              : TEXT_ROWS;
    sendUiTextRows(services, player.id, DEV_UIKIT_TEXT_PANEL_GROUP_ID, tabRows);
    sendUiControls(services, player.id, DEV_UIKIT_TEXT_PANEL_GROUP_ID, [
        { label: "Icon rows" },
        { label: "Menu grid" },
        { label: "Refresh" },
    ]);
}

const MENU_BUTTONS = [
    { itemId: 4151, label: "Weapons" },
    { itemId: 554, label: "Magic" },
    { itemId: 995, label: "Currency" },
    { itemId: 1265, label: "Tools" },
    { itemId: 385, label: "Supplies" },
    { itemId: 1127, label: "Equipment" },
    { itemId: 3144, label: "Travel" },
] as const;

function openMenuGrid(player: PlayerState, services: ScriptServices, selectedIndex?: number): void {
    openUiPanel(services, player, DEV_UIKIT_MENU_PANEL_GROUP_ID, "Developer Menu Buttons");
    sendUiMenuButtons(services, player.id, DEV_UIKIT_MENU_PANEL_GROUP_ID, MENU_BUTTONS);
    const selected = selectedIndex === undefined ? "Back to text rows" : `Selected: ${MENU_BUTTONS[selectedIndex]?.label ?? "button"}`;
    sendUiFooterButton(services, player.id, DEV_UIKIT_MENU_PANEL_GROUP_ID, selected);
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
    const iconRows = ICON_ROWS.map((row) => ({
        ...row,
        description: activeTab === 0
            ? row.description
            : activeTab === 1
              ? "Asset tab selected."
              : "Scroll tab selected.",
    }));
    sendUiIconRows(services, player.id, DEV_UIKIT_ICON_PANEL_GROUP_ID, iconRows);
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
            actionId: "show_menu_grid",
            handle: ({ player }) => openMenuGrid(player, services),
        },
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 2,
            actionId: "refresh_text_rows",
            handle: ({ player }) => openTextMenu(player, services),
        },
        ...[0, 1, 2].map((tabIndex) => ({
            componentId: ComponentIds.TAB_BASE + tabIndex,
            actionId: `select_text_tab_${tabIndex}`,
            handle: ({ player }: { player: PlayerState }) => openTextMenu(player, services, tabIndex),
        })),
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

    registerUiPanelActions(registry, services, DEV_UIKIT_MENU_PANEL_GROUP_ID, [
        {
            componentId: ComponentIds.FOOTER_BUTTON,
            actionId: "show_text_rows",
            handle: ({ player }) => openTextMenu(player, services),
        },
        ...MENU_BUTTONS.map((_, buttonIndex) => ({
            componentId: ComponentIds.MENU_BUTTON_BACKGROUND_BASE + buttonIndex,
            actionId: `select_menu_button_${buttonIndex}`,
            handle: ({ player }: { player: PlayerState }) => openMenuGrid(player, services, buttonIndex),
        })),
    ]);
}
