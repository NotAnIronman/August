import { ClientSettingId, isValidClientSetting } from "@august/protocol/ui/clientSettings";
import { VARBIT_XPDROPS_ENABLED } from "@august/game-model/state/vars";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { DisplayMode, getRootInterfaceId } from "./viewport";
import { createOrbsBootstrapActions, getMapClockValue, rewriteMinimapOrbsMount, VARBIT_MINIMAP_TOGGLE } from "./minimapOrbs";

export function setXpDropsVisible(player: PlayerState, services: ScriptServices, visible: boolean): void {
    const value = visible ? 1 : 0;
    player.varps.setVarbitValue(VARBIT_XPDROPS_ENABLED, value);
    services.variables.sendVarbit(player, VARBIT_XPDROPS_ENABLED, value);
    const mount = services.viewport.getDefaultInterfaces(player.displayMode).find(entry => entry.groupId === 122);
    const targetUid = player.widgets.getByGroup(122)?.targetUid ?? mount?.targetUid;
    if (targetUid !== undefined) services.dialog.queueWidgetEvent(player.id, { action: "set_hidden", uid: targetUid, hidden: !visible });
}

/** Returns true when gamemode-specific tabs need refreshing after a root change. */
export function applyClientSetting(player: PlayerState, services: ScriptServices, setting: number, value: number): boolean {
    if (!isValidClientSetting(setting, value)) return false;
    if (setting === ClientSettingId.XpDrops) {
        setXpDropsVisible(player, services, value === 1);
        return false;
    }
    if (player.displayMode === DisplayMode.MOBILE) return false;
    player.varps.preferredDisplayMode = value;
    if (player.displayMode === value) return false;
    // Preserve unlocked permanent interfaces, including tutorial restrictions.
    const oldMounts = services.viewport.getDefaultInterfaces(player.displayMode);
    const openGroups = new Set(oldMounts.filter(mount => player.widgets.isOpen(mount.groupId)).map(mount => mount.groupId));
    if (player.widgets.isOpen(895)) openGroups.add(160);
    const settingsOpen = player.widgets.isOpen(134);
    const closed = player.widgets.closeAll({ silent: true });
    services.dialog.getInterfaceService()?.triggerCloseHooksForEntries(player, closed);
    player.displayMode = value;
    services.dialog.queueWidgetEvent(player.id, { action: "set_root", groupId: getRootInterfaceId(value) });
    const minimapToggle = player.varps.getVarbitValue(VARBIT_MINIMAP_TOGGLE);
    const xpEnabled = player.varps.getVarbitValue(VARBIT_XPDROPS_ENABLED) === 1;
    for (const mount of services.viewport.getDefaultInterfaces(value)) {
        if (!openGroups.has(mount.groupId)) continue;
        const next = rewriteMinimapOrbsMount(mount, value, minimapToggle);
        services.dialog.openSubInterface(player, next.targetUid, next.groupId, next.type, {
            modal: false, varps: next.varps, varbits: next.varbits, postScripts: next.postScripts,
            hiddenUids: next.groupId === 122 && !xpEnabled ? [next.targetUid] : undefined,
        });
        if (mount.groupId === 160) {
            for (const action of createOrbsBootstrapActions(next.groupId, getMapClockValue(player.varps, services.system.getCurrentTick()))) {
                services.dialog.queueWidgetEvent(player.id, action);
            }
        }
    }
    if (settingsOpen) services.dialog.openSubInterface(player, services.viewport.getMainmodalUid(value), 134, 0);
    return true;
}
