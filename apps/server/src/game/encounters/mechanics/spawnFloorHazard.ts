import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import type { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import {
    createInactiveMechanicHandle,
    createMechanicHandle,
    type MechanicHandle,
} from "@server/game/encounters/mechanics/MechanicHandle";
import { registerMechanic } from "@server/game/encounters/mechanics/MechanicRegistry";
import { runMechanicCallback } from "@server/game/encounters/mechanics/MechanicSafety";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

export interface FloorHazardTile {
    readonly x: number;
    readonly y: number;
    readonly level: number;
}

export interface FloorHazardParams {
    readonly id?: string;
    readonly tiles: readonly FloorHazardTile[];
    readonly graphicId: number;
    /**
     * Optional stationary visual marker. Use this when the selected cache GFX
     * has no visible ground model, or when a telegraph must stay readable for
     * its whole warning window.
     */
    readonly markerNpcId?: number;
    readonly telegraphTicks: number;
    readonly liveTicks: number;
    readonly damage: number | ((rng: EncounterRandom) => number);
    readonly tickInterval?: number;
    /** Players eligible for this hazard; caller supplies instance membership. */
    readonly players: readonly PlayerState[];
    readonly appliesTo?: "all-members" | "current-target" | readonly number[];
    readonly currentTargetId?: number;
    readonly projectileId?: number;
}

function resolvePlayers(params: FloorHazardParams): readonly PlayerState[] {
    if (params.appliesTo === "current-target") {
        return params.players.filter((player) => player.id === params.currentTargetId);
    }
    if (Array.isArray(params.appliesTo)) {
        const allowed = new Set(params.appliesTo);
        return params.players.filter((player) => allowed.has(player.id));
    }
    return params.players;
}

/** Telegraphs fixed tiles, then damages players who remain on them. */
export function spawnFloorHazard(
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: FloorHazardParams,
): MechanicHandle {
    const source = services.combat.getNpc(runtime.currentNpcRuntimeId);
    if (!source || params.tiles.length === 0) {
        return createInactiveMechanicHandle(`${runtime.id}:floor-hazard:noop`);
    }
    const id = params.id ?? `floor-hazard:${runtime.nextMechanicSerial()}`;
    const targets = resolvePlayers(params);
    const taskIds = new Set<number>();
    const markerIds = new Set<number>();
    let handle!: MechanicHandle;
    const finish = (): void => {
        handle.cancel();
    };
    handle = createMechanicHandle(`${runtime.id}:${id}`, () => {
        for (const taskId of taskIds) services.scheduler.cancel(taskId);
        taskIds.clear();
        for (const markerId of markerIds) services.npc.removeNpc(markerId);
        markerIds.clear();
        runtime.releaseMechanic(handle);
    });
    runtime.ownMechanic(handle);

    try {
        for (const tile of params.tiles) {
            services.animation.playLocGraphic({ spotId: params.graphicId, tile, level: tile.level });
            if (params.markerNpcId !== undefined) {
                const marker = services.npc.spawnNpc({
                    id: params.markerNpcId,
                    x: tile.x,
                    y: tile.y,
                    level: tile.level,
                    worldViewId: source.worldViewId,
                    wanderRadius: 0,
                    isAggressive: false,
                    isUnattackable: true,
                    isImmovable: true,
                    respawns: false,
                });
                if (marker) markerIds.add(marker.id);
            }
            if (params.projectileId !== undefined) {
                services.projectiles.launch({
                    projectileId: params.projectileId,
                    source: { tileX: source.tileX, tileY: source.tileY, plane: source.level },
                    target: { tileX: tile.x, tileY: tile.y, plane: tile.level },
                    sourceHeight: 240, endHeight: 0, slope: 45, startPos: 0, startCycleOffset: 0,
                    endCycleOffset: Math.max(0, params.telegraphTicks) * 30,
                });
            }
        }

        const interval = Math.max(1, Math.trunc(params.tickInterval ?? 1));
        const pulses = Math.max(1, Math.ceil(Math.max(1, params.liveTicks) / interval));
        for (let pulse = 0; pulse < pulses; pulse += 1) {
            let taskId = -1;
            taskId = services.scheduler.after(
                Math.max(0, Math.trunc(params.telegraphTicks)) + pulse * interval,
                (tick) => runMechanicCallback(runtime, handle, id, () => {
                    taskIds.delete(taskId);
                    if (!handle.isActive) return;
                    if (source.getHitpoints() <= 0) {
                        finish();
                        return;
                    }
                    for (const player of targets) {
                        if (player.worldViewId !== source.worldViewId || player.level !== source.level) continue;
                        if (params.tiles.some((tile) => player.tileX === tile.x && player.tileY === tile.y && player.level === tile.level)) {
                            const damage = Math.max(
                                0,
                                Math.trunc(typeof params.damage === "function" ? params.damage(runtime.rng) : params.damage),
                            );
                            services.combat.applyNpcDamageToPlayer(source, player, HITMARK_DAMAGE, damage, tick);
                        }
                    }
                    if (pulse === pulses - 1) finish();
                }),
                { kind: "npc", id: source.id },
            );
            taskIds.add(taskId);
        }
    } catch (error) {
        handle.cancel();
        throw error;
    }
    return handle;
}

registerMechanic("spawn-floor-hazard", spawnFloorHazard);
