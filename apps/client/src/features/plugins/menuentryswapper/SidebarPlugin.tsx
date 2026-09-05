import { useSyncExternalStore } from "react";
import type { ClientSidebarPluginDefinition } from "@client/features/sidebar/pluginTypes";
import type { MenuEntrySwapperPlugin } from "./MenuEntrySwapperPlugin";

export const MENU_ENTRY_SWAPPER_SIDEBAR_PLUGIN: ClientSidebarPluginDefinition = {
    id: "menu_entry_swapper", title: "Menu Entry Swapper", priority: 140,
    panelId: "menu_entry_swapper", tooltip: "Customize left-click and shift-click actions",
    icon: ({ label }) => <svg className="rl-sidebar-icon-svg" viewBox="0 0 24 24" aria-label={label}>
        <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />
    </svg>,
};
export function MenuEntrySwapperPanel({ plugin }: { plugin: MenuEntrySwapperPlugin }) {
    const { config } = useSyncExternalStore(plugin.subscribe, plugin.getState, plugin.getState);
    const toggles = [
        ["enabled", "Enable Menu Entry Swapper"], ["bank", "Prefer Bank"],
        ["trade", "Prefer Trade"], ["travel", "Prefer Travel"], ["quick", "Prefer quick actions"],
    ] as const;
    return <div className="rl-sidebar-panel-content rl-sidebar-scrollable">
        <div className="rl-sidebar-panel-title">Menu Entry Swapper</div>
        <p className="rl-sidebar-panel-copy">Hold Ctrl and right-click an NPC, object, ground item, inventory item or spell.
            Shift + right-click also works in browsers that do not reserve it for their own context menu.
            Choose Swap left-click or Swap shift-click. Preferences save on this browser.
            Saved non-combat choices can replace Attack. Active spell/item targeting is unchanged.</p>
        {toggles.map(([key, label]) => <label className="rl-sidebar-check" key={key}>
            <input type="checkbox" checked={config[key]}
                onChange={event => plugin.setConfig({ [key]: event.target.checked })} />
            <span>{label}</span>
        </label>)}
        <p className="rl-sidebar-panel-copy">Saved custom swaps</p>
        {Object.entries(config.swaps).map(([key, preference]) => <div key={key} className="rl-sidebar-settings-group">
            <div>{preference.name || key}</div>
            <div>Left: {preference.left ?? "Default"}; Shift: {preference.shift ?? "Default"}</div>
            <button onClick={() => plugin.removeSwap(key)}>Reset</button>
        </div>)}
    </div>;
}
