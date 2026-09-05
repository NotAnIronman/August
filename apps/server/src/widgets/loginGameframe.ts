import { VARBIT_XPDROPS_ENABLED } from "@august/game-model/state/vars";
import { SIDE_JOURNAL_GROUP_ID } from "@august/protocol/ui/sideJournal";
import type { PlayerState } from "@server/game/player";
import type { InterfaceMount, WidgetAction } from "@server/widgets/WidgetManager";
import {
    MINIMAP_WIDGET_GROUP_ID, VARBIT_MINIMAP_TOGGLE, createOrbsBootstrapActions,
    getMapClockValue, getMinimapToggleVarbits, rewriteMinimapOrbsMount,
} from "@server/widgets/minimapOrbs";

/** Login and character creation must mount through the same registry as layout changes. */
export function mountLoginGameframe(
    player: PlayerState,
    mounts: InterfaceMount[],
    services: {
        currentTick: number;
        queue: (action: WidgetAction) => void;
        getSideJournalBootstrap: () => { varps?: Record<number, number>; varbits?: Record<number, number> };
        applySideJournal: () => void;
    },
): void {
    const xpEnabled = player.varps.getVarbitValue(VARBIT_XPDROPS_ENABLED) === 1;
    const minimapToggle = player.varps.getVarbitValue(VARBIT_MINIMAP_TOGGLE);
    const mapClock = getMapClockValue(player.varps, services.currentTick);
    for (const mount of mounts) {
        const next = rewriteMinimapOrbsMount(mount, player.displayMode, minimapToggle);
        const journal = next.groupId === SIDE_JOURNAL_GROUP_ID ? services.getSideJournalBootstrap() : {};
        player.widgets.open(next.groupId, {
            targetUid: next.targetUid, type: next.type, modal: false,
            postScripts: next.postScripts,
            hiddenUids: next.groupId === 122 && !xpEnabled ? [next.targetUid] : undefined,
            varps: { ...next.varps, ...journal.varps },
            varbits: { ...next.varbits, ...journal.varbits,
                ...(mount.groupId === MINIMAP_WIDGET_GROUP_ID ? getMinimapToggleVarbits(minimapToggle) : {}) },
        });
        if (mount.groupId === MINIMAP_WIDGET_GROUP_ID) {
            for (const action of createOrbsBootstrapActions(next.groupId, mapClock)) services.queue(action);
        }
        if (next.groupId === SIDE_JOURNAL_GROUP_ID) services.applySideJournal();
    }
}
