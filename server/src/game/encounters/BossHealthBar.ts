import {
    BOSS_HEALTH_BAR_GROUP_ID,
    BOSS_HEALTH_BAR_SEGMENT_COUNT,
    BossHealthBarComponent,
    bossHealthBarUid,
} from "../../../../client/common/ui/bossHealthBar";
import { DisplayMode, getBossHealthBarHudUid } from "../../widgets/viewport";
import type { PlayerState } from "../player";
import type { ScriptServices } from "../scripts/types";

export interface BossHealthBarSnapshot {
    readonly name: string;
    readonly current: number;
    readonly maximum: number;
}

function targetUid(player: PlayerState): number {
    return getBossHealthBarHudUid((player.displayMode ?? DisplayMode.RESIZABLE_NORMAL) as DisplayMode);
}

export function openBossHealthBar(
    player: PlayerState,
    services: ScriptServices,
    snapshot: BossHealthBarSnapshot,
): void {
    const mountUid = targetUid(player);
    services.dialog.openSubInterface(
        player,
        mountUid,
        BOSS_HEALTH_BAR_GROUP_ID,
        1,
        { modal: false },
    );
    // Toplevel keeps the dedicated HP-bar mount hidden until the main-game
    // bootstrap script enables it. August owns that lifecycle server-side.
    services.dialog.queueWidgetEvent?.(player.id, {
        action: "set_hidden",
        uid: mountUid,
        hidden: false,
    });
    updateBossHealthBar(player, services, snapshot);
}

export function updateBossHealthBar(
    player: PlayerState,
    services: ScriptServices,
    snapshot: BossHealthBarSnapshot,
): void {
    const maximum = Math.max(1, Math.trunc(snapshot.maximum));
    const current = Math.max(0, Math.min(maximum, Math.trunc(snapshot.current)));
    const ratio = current / maximum;
    const visibleSegments = current > 0 ? Math.max(1, Math.ceil(ratio * BOSS_HEALTH_BAR_SEGMENT_COUNT)) : 0;
    services.dialog.queueWidgetEvent?.(player.id, {
        action: "set_text",
        uid: bossHealthBarUid(BossHealthBarComponent.Name),
        text: snapshot.name,
    });
    services.dialog.queueWidgetEvent?.(player.id, {
        action: "set_text",
        uid: bossHealthBarUid(BossHealthBarComponent.Value),
        text: `${current} / ${maximum} (${(ratio * 100).toFixed(1)}%)`,
    });
    for (let index = 0; index < BOSS_HEALTH_BAR_SEGMENT_COUNT; index++) {
        services.dialog.queueWidgetEvent?.(player.id, {
            action: "set_hidden",
            uid: bossHealthBarUid(BossHealthBarComponent.SegmentStart + index),
            hidden: index >= visibleSegments,
        });
    }
}

export function closeBossHealthBar(player: PlayerState, services: ScriptServices): void {
    const mountUid = targetUid(player);
    services.dialog.closeSubInterface(player, mountUid, BOSS_HEALTH_BAR_GROUP_ID);
    services.dialog.queueWidgetEvent?.(player.id, {
        action: "set_hidden",
        uid: mountUid,
        hidden: true,
    });
}
