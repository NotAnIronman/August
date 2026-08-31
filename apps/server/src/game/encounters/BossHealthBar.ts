import {
    BOSS_HEALTH_BAR_GROUP_ID,
    BossHealthBarComponent,
    BossHealthBarVar,
    BossHealthBarVarbit,
    bossHealthBarUid,
    normalizeBossHealth,
} from "@august/protocol/ui/bossHealthBar";
import { DisplayMode, getBossHealthBarHudUid } from "@server/widgets/viewport";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

export interface BossHealthBarSnapshot {
    /** Cache NPC type used by the native interface for its default name. */
    readonly npcTypeId: number;
    readonly name: string;
    readonly current: number;
    readonly maximum: number;
}

/** The native HUD only needs these two script-service facades. */
export type BossHealthBarServices = Pick<ScriptServices, "dialog" | "variables">;
type InstanceBossHealthBarServices = BossHealthBarServices & Pick<ScriptServices, "scheduler">;

export type BossHealthBarSnapshotResolver = () => BossHealthBarSnapshot | undefined;

export interface InstanceBossHealthBarLifecyclePort {
    enter(player: PlayerState, resolveSnapshot: BossHealthBarSnapshotResolver): void;
    leave(player: PlayerState): void;
    sync(): void;
}

interface ActiveInstanceBossHealthBar {
    readonly resolveSnapshot: BossHealthBarSnapshotResolver;
    lastStateKey?: string;
}

const mountedTargetByPlayer = new WeakMap<PlayerState, number>();
const previousDisabledValueByPlayer = new WeakMap<PlayerState, number>();

function targetUid(player: PlayerState): number {
    return getBossHealthBarHudUid((player.displayMode ?? DisplayMode.RESIZABLE_NORMAL) as DisplayMode);
}

export function openBossHealthBar(
    player: PlayerState,
    services: BossHealthBarServices,
    snapshot: BossHealthBarSnapshot,
): void {
    const mountUid = targetUid(player);
    if (!previousDisabledValueByPlayer.has(player)) {
        previousDisabledValueByPlayer.set(
            player,
            player.varps.getVarbitValue(BossHealthBarVarbit.Disabled),
        );
    }
    const previousMountUid = mountedTargetByPlayer.get(player);
    if (previousMountUid !== undefined && previousMountUid !== mountUid) {
        services.dialog.closeSubInterface(
            player,
            previousMountUid,
            BOSS_HEALTH_BAR_GROUP_ID,
        );
    }

    const health = normalizeBossHealth(snapshot.current, snapshot.maximum);
    const npcTypeId = Math.max(0, Math.trunc(snapshot.npcTypeId));
    setBossHealthState(player, npcTypeId, health.current, health.maximum);
    services.dialog.openSubInterface(
        player,
        mountUid,
        BOSS_HEALTH_BAR_GROUP_ID,
        1,
        {
            modal: false,
            // Native script 2099 installs its listeners during onLoad and script
            // 2103 immediately reads this state. Supplying it atomically avoids
            // mounting the cache-hidden bar in its empty state during a rebuild.
            varps: { [BossHealthBarVar.NpcType]: npcTypeId },
            varbits: {
                [BossHealthBarVarbit.Current]: health.current,
                [BossHealthBarVarbit.Maximum]: health.maximum,
                [BossHealthBarVarbit.Boss]: 1,
                [BossHealthBarVarbit.Disabled]: 0,
            },
        },
    );
    mountedTargetByPlayer.set(player, mountUid);
    // Toplevel keeps the dedicated HP-bar mount hidden until the main-game
    // bootstrap script enables it. August owns that lifecycle server-side.
    services.dialog.queueWidgetEvent?.(player.id, {
        action: "set_hidden",
        uid: mountUid,
        hidden: false,
    });
    queueBossName(player, services, snapshot.name);
}

export function updateBossHealthBar(
    player: PlayerState,
    services: BossHealthBarServices,
    snapshot: BossHealthBarSnapshot,
): void {
    const mountUid = targetUid(player);
    if (
        mountedTargetByPlayer.get(player) !== mountUid ||
        !player.widgets.isOpen(BOSS_HEALTH_BAR_GROUP_ID)
    ) {
        openBossHealthBar(player, services, snapshot);
        return;
    }

    const health = normalizeBossHealth(snapshot.current, snapshot.maximum);
    const npcTypeId = Math.max(0, Math.trunc(snapshot.npcTypeId));
    setBossHealthState(player, npcTypeId, health.current, health.maximum);
    services.variables.sendVarp(player, BossHealthBarVar.NpcType, npcTypeId);
    services.variables.sendVarbit(player, BossHealthBarVarbit.Maximum, health.maximum);
    services.variables.sendVarbit(player, BossHealthBarVarbit.Current, health.current);
    services.variables.sendVarbit(player, BossHealthBarVarbit.Boss, 1);
    services.variables.sendVarbit(player, BossHealthBarVarbit.Disabled, 0);
    queueBossName(player, services, snapshot.name);
}

export function closeBossHealthBar(player: PlayerState, services: BossHealthBarServices): void {
    const mountUid = mountedTargetByPlayer.get(player) ?? targetUid(player);
    const previousDisabledValue =
        previousDisabledValueByPlayer.get(player) ??
        player.varps.getVarbitValue(BossHealthBarVarbit.Disabled);
    mountedTargetByPlayer.delete(player);
    previousDisabledValueByPlayer.delete(player);
    setBossHealthState(player, -1, 0, 1);
    services.variables.sendVarp(player, BossHealthBarVar.NpcType, -1);
    services.variables.sendVarbit(player, BossHealthBarVarbit.Current, 0);
    services.variables.sendVarbit(player, BossHealthBarVarbit.Maximum, 1);
    services.variables.sendVarbit(player, BossHealthBarVarbit.Boss, 0);
    services.variables.sendVarbit(
        player,
        BossHealthBarVarbit.Disabled,
        previousDisabledValue,
    );
    services.dialog.closeSubInterface(player, mountUid, BOSS_HEALTH_BAR_GROUP_ID);
}

function setBossHealthState(
    player: PlayerState,
    npcTypeId: number,
    current: number,
    maximum: number,
): void {
    player.varps.setVarpValue(BossHealthBarVar.NpcType, npcTypeId);
    player.varps.setVarbitValue(BossHealthBarVarbit.Current, current);
    player.varps.setVarbitValue(BossHealthBarVarbit.Maximum, maximum);
    player.varps.setVarbitValue(BossHealthBarVarbit.Boss, npcTypeId >= 0 ? 1 : 0);
}

function queueBossName(player: PlayerState, services: BossHealthBarServices, name: string): void {
    services.dialog.queueWidgetEvent?.(player.id, {
        action: "set_text",
        uid: bossHealthBarUid(BossHealthBarComponent.Name),
        text: name,
    });
}

/**
 * Owns the player-facing lifecycle for instance boss bars. Instance content
 * supplies only a snapshot resolver; joining, leaving, display-mode repair,
 * and health updates are handled once here for every encounter.
 */
export class InstanceBossHealthBarLifecycle implements InstanceBossHealthBarLifecyclePort {
    private readonly active = new Map<PlayerState, ActiveInstanceBossHealthBar>();

    constructor(private readonly getServices: () => InstanceBossHealthBarServices | undefined) {}

    enter(player: PlayerState, resolveSnapshot: BossHealthBarSnapshotResolver): void {
        const entry: ActiveInstanceBossHealthBar = { resolveSnapshot };
        this.active.set(player, entry);
        this.refresh(player, entry, true);
        // REBUILD_REGION can replace the client scene after the immediate
        // interface packet has arrived without changing the server widget
        // registry. Re-open once the instance scene has settled. Entry identity
        // prevents a stale callback from touching a player who left or joined a
        // different room during those three ticks.
        this.getServices()?.scheduler.after(
            3,
            () => {
                if (this.active.get(player) !== entry) return;
                this.refresh(player, entry, true);
            },
            { kind: "player", id: player.id },
        );
    }

    leave(player: PlayerState): void {
        if (!this.active.delete(player)) return;
        const services = this.getServices();
        if (services) closeBossHealthBar(player, services);
    }

    sync(): void {
        for (const [player, entry] of this.active) {
            this.refresh(player, entry, false);
        }
    }

    private refresh(
        player: PlayerState,
        entry: ActiveInstanceBossHealthBar,
        forceOpen: boolean,
    ): void {
        const snapshot = entry.resolveSnapshot();
        const services = this.getServices();
        if (!snapshot || !services) return;

        const stateKey = this.getStateKey(player, snapshot);
        if (!forceOpen && entry.lastStateKey === stateKey) return;
        if (forceOpen) openBossHealthBar(player, services, snapshot);
        else updateBossHealthBar(player, services, snapshot);
        // Opening can change widgets.isOpen(), so cache the post-operation key.
        entry.lastStateKey = this.getStateKey(player, snapshot);
    }

    private getStateKey(player: PlayerState, snapshot: BossHealthBarSnapshot): string {
        return `${snapshot.npcTypeId}:${snapshot.name}:${snapshot.current}:${snapshot.maximum}:${
            player.displayMode
        }:${player.widgets.isOpen(BOSS_HEALTH_BAR_GROUP_ID) ? 1 : 0}`;
    }
}
