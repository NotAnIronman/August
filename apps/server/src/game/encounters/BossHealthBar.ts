import {
    normalizeBossHealth,
    normalizeBossHealthBarMarkers,
    type BossHealthBarMarker,
    type BossHealthBarState,
} from "@august/protocol/ui/bossHealthBar";
import type { EncounterDefinition } from "@server/game/encounters/EncounterTypes";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

export interface BossHealthBarSnapshot {
    /** Stable NPC type identity available for optional client portrait treatment. */
    readonly npcTypeId: number;
    readonly name: string;
    readonly current: number;
    readonly maximum: number;
    readonly markers: readonly BossHealthBarMarker[];
}

/** The custom HUD is a single player-scoped widget event. */
export type BossHealthBarServices = Pick<ScriptServices, "dialog">;

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

export function openBossHealthBar(
    player: PlayerState,
    services: BossHealthBarServices,
    snapshot: BossHealthBarSnapshot,
): void {
    queueBossHealthBarState(player, services, snapshot);
}

export function updateBossHealthBar(
    player: PlayerState,
    services: BossHealthBarServices,
    snapshot: BossHealthBarSnapshot,
): void {
    queueBossHealthBarState(player, services, snapshot);
}

export function closeBossHealthBar(player: PlayerState, services: BossHealthBarServices): void {
    queueBossHealthBarState(player, services, { active: false });
}

/**
 * Uses explicitly configured HUD markers when present. Otherwise the gameplay
 * definition is the source of truth: mechanic thresholds win a same-percent
 * collision with phase boundaries, and the 100% starting phase is omitted.
 */
export function deriveBossHealthBarMarkers(
    definition: EncounterDefinition,
): readonly BossHealthBarMarker[] {
    const configured = definition.bossHealthBar?.markers;
    if (configured !== undefined) return normalizeBossHealthBarMarkers(configured);
    return normalizeBossHealthBarMarkers([
        ...(definition.thresholds ?? []).map((threshold) => ({
            percent: threshold.atHealthPercent,
            label: threshold.id,
            style: "mechanic" as const,
        })),
        ...(definition.phases ?? [])
            .filter((phase) => phase.startsAtHealthPercent < 100)
            .map((phase) => ({
                percent: phase.startsAtHealthPercent,
                label: phase.id,
                style: "phase" as const,
            })),
    ]);
}

function queueBossHealthBarState(
    player: PlayerState,
    services: BossHealthBarServices,
    state: BossHealthBarSnapshot | { readonly active: false },
): void {
    let payload: BossHealthBarState;
    if ("active" in state) {
        payload = state;
    } else {
        const health = normalizeBossHealth(state.current, state.maximum);
        payload = {
            active: true,
            npcTypeId: Math.max(0, Math.trunc(state.npcTypeId)),
            name: state.name,
            current: health.current,
            maximum: health.maximum,
            markers: normalizeBossHealthBarMarkers(state.markers),
        };
    }
    services.dialog.queueWidgetEvent?.(player.id, {
        action: "set_boss_health_bar",
        ...payload,
    });
}

/**
 * Owns the player-facing lifecycle for instance boss bars. Instance content
 * supplies only a snapshot resolver; joining, leaving, and health updates are
 * handled once here for every encounter.
 */
export class InstanceBossHealthBarLifecycle implements InstanceBossHealthBarLifecyclePort {
    private readonly active = new Map<PlayerState, ActiveInstanceBossHealthBar>();

    constructor(private readonly getServices: () => BossHealthBarServices | undefined) {}

    enter(player: PlayerState, resolveSnapshot: BossHealthBarSnapshotResolver): void {
        const entry: ActiveInstanceBossHealthBar = { resolveSnapshot };
        this.active.set(player, entry);
        this.refresh(player, entry, true);
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

        const stateKey = this.getStateKey(snapshot);
        if (!forceOpen && entry.lastStateKey === stateKey) return;
        if (forceOpen) openBossHealthBar(player, services, snapshot);
        else updateBossHealthBar(player, services, snapshot);
        entry.lastStateKey = stateKey;
    }

    private getStateKey(snapshot: BossHealthBarSnapshot): string {
        const health = normalizeBossHealth(snapshot.current, snapshot.maximum);
        return JSON.stringify([
            Math.max(0, Math.trunc(snapshot.npcTypeId)),
            snapshot.name,
            health.current,
            health.maximum,
            normalizeBossHealthBarMarkers(snapshot.markers).map((marker) => [
                marker.percent,
                marker.label,
                marker.style,
            ]),
        ]);
    }
}
