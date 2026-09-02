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

export type FloorHazardTargetMode = "none" | "current-target" | "all-members" | "random";

/** The visible warning placed before a floor hazard resolves. Any combination is valid. */
export interface FloorHazardTell {
    readonly graphicId?: number;
    readonly npcId?: number;
    readonly locId?: number;
    readonly locShape?: number;
    readonly locRotation?: number;
}

/** Effects applied only to a player who is still standing on a resolved hazard tile. */
export interface FloorHazardEffect {
    readonly disablePrayers?: boolean;
    readonly stunTicks?: number;
}

export interface FloorHazardParams {
    readonly id?: string;
    /** Fixed candidate tiles. Omit when a caller supplies only randomTiles. */
    readonly tiles?: readonly FloorHazardTile[];
    /** Candidate tiles sampled for the random portion of a multi-hazard event. */
    readonly randomTiles?: readonly FloorHazardTile[];
    /** Whether the event reserves tiles for its target(s), or uses random tiles only. */
    readonly targetMode?: FloorHazardTargetMode;
    /** Number of tells to place. Defaults to the supplied fixed tile count. */
    readonly hazardQuantity?: number;
    /** Legacy alias retained for current content while encounters migrate. */
    readonly quantity?: number;
    /** Preferred visual configuration for the warning. */
    readonly tell?: FloorHazardTell;
    /** Legacy visual fields retained for compatibility. */
    readonly graphicId?: number;
    /**
     * Optional stationary visual marker. Use this when the selected cache GFX
     * has no visible ground model, or when a telegraph must stay readable for
     * its whole warning window.
     */
    readonly markerNpcId?: number;
    /** Ticks from tell placement until damage resolves. */
    readonly hazardTime?: number;
    /** Legacy alias for hazardTime. */
    readonly telegraphTicks?: number;
    readonly liveTicks: number;
    /** Damage dealt when not dodged. */
    readonly hazardDamage?: number | ((rng: EncounterRandom) => number);
    /** Legacy alias for hazardDamage. */
    readonly damage?: number | ((rng: EncounterRandom) => number);
    /** Optional on-hit utility, such as disabling prayers or stunning. */
    readonly effect?: FloorHazardEffect;
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

function sameTile(left: FloorHazardTile, right: FloorHazardTile): boolean {
    return left.x === right.x && left.y === right.y && left.level === right.level;
}

function selectHazardTiles(
    runtime: EncounterRuntime,
    params: FloorHazardParams,
): readonly FloorHazardTile[] {
    const fixed = [...(params.tiles ?? [])];
    const candidates = [...(params.randomTiles ?? fixed)];
    const quantity = Math.max(0, Math.trunc(params.hazardQuantity ?? params.quantity ?? fixed.length));
    const selected: FloorHazardTile[] = [];
    const add = (tile: FloorHazardTile | undefined): void => {
        if (tile && !selected.some((existing) => sameTile(existing, tile))) selected.push(tile);
    };
    const targetMode = params.targetMode ?? "none";
    if (targetMode === "current-target") {
        const player = params.players.find((candidate) => candidate.id === params.currentTargetId);
        if (player) add({ x: player.tileX, y: player.tileY, level: player.level });
    } else if (targetMode === "all-members") {
        for (const player of params.players) add({ x: player.tileX, y: player.tileY, level: player.level });
    } else if (targetMode === "none") {
        for (const tile of fixed) add(tile);
    }
    const pool = candidates.filter((candidate) => !selected.some((tile) => sameTile(tile, candidate)));
    while (selected.length < quantity && pool.length > 0) {
        selected.push(pool.splice(runtime.rng.nextInt(pool.length), 1)[0]!);
    }
    return selected;
}

/** Places selected tells, then damages only players who remain on those tiles. */
export function spawnFloorHazard(
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: FloorHazardParams,
): MechanicHandle {
    const source = services.combat.getNpc(runtime.currentNpcRuntimeId);
    const tiles = selectHazardTiles(runtime, params);
    if (!source || tiles.length === 0) {
        return createInactiveMechanicHandle(`${runtime.id}:floor-hazard:noop`);
    }
    const id = params.id ?? `floor-hazard:${runtime.nextMechanicSerial()}`;
    const targets = resolvePlayers(params);
    const taskIds = new Set<number>();
    const markerIds = new Set<number>();
    const locTellTiles: Array<{ tile: FloorHazardTile; shape: number }> = [];
    let handle!: MechanicHandle;
    const finish = (): void => {
        handle.cancel();
    };
    handle = createMechanicHandle(`${runtime.id}:${id}`, () => {
        for (const taskId of taskIds) services.scheduler.cancel(taskId);
        taskIds.clear();
        for (const markerId of markerIds) services.npc.removeNpc(markerId);
        markerIds.clear();
        for (const { tile, shape } of locTellTiles) {
            services.location.clearTemporaryLoc({ worldViewId: source.worldViewId }, 0, tile, tile.level, shape);
        }
        locTellTiles.length = 0;
        runtime.releaseMechanic(handle);
    });
    runtime.ownMechanic(handle);

    try {
        const tell = params.tell;
        const graphicId = tell?.graphicId ?? params.graphicId;
        const markerNpcId = tell?.npcId ?? params.markerNpcId;
        const hazardTime = Math.max(0, Math.trunc(params.hazardTime ?? params.telegraphTicks ?? 0));
        for (const tile of tiles) {
            if (graphicId !== undefined && graphicId > 0) {
                services.animation.playLocGraphic({ spotId: graphicId, tile, level: tile.level });
            }
            if (markerNpcId !== undefined) {
                const marker = services.npc.spawnNpc({
                    id: markerNpcId,
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
            if (tell?.locId !== undefined && tell.locId > 0) {
                const shape = Math.max(0, Math.trunc(tell.locShape ?? 10));
                services.location.replaceTemporaryLoc(
                    { worldViewId: source.worldViewId }, 0, tell.locId, tile, tile.level,
                    { newShape: shape, newRotation: tell.locRotation ?? 0 },
                );
                locTellTiles.push({ tile, shape });
            }
            if (params.projectileId !== undefined) {
                services.projectiles.launch({
                    projectileId: params.projectileId,
                    source: { tileX: source.tileX, tileY: source.tileY, plane: source.level },
                    target: { tileX: tile.x, tileY: tile.y, plane: tile.level },
                    sourceHeight: 240, endHeight: 0, slope: 45, startPos: 0, startCycleOffset: 0,
                    endCycleOffset: hazardTime * 30,
                });
            }
        }

        const interval = Math.max(1, Math.trunc(params.tickInterval ?? 1));
        const pulses = Math.max(1, Math.ceil(Math.max(1, params.liveTicks) / interval));
        for (let pulse = 0; pulse < pulses; pulse += 1) {
            let taskId = -1;
            taskId = services.scheduler.after(
                hazardTime + pulse * interval,
                (tick) => runMechanicCallback(runtime, handle, id, () => {
                    taskIds.delete(taskId);
                    if (!handle.isActive) return;
                    if (source.getHitpoints() <= 0) {
                        finish();
                        return;
                    }
                    for (const player of targets) {
                        if (player.worldViewId !== source.worldViewId || player.level !== source.level) continue;
                        if (tiles.some((tile) => player.tileX === tile.x && player.tileY === tile.y && player.level === tile.level)) {
                            const configuredDamage = params.hazardDamage ?? params.damage ?? 0;
                            const damage = Math.max(
                                0,
                                Math.trunc(typeof configuredDamage === "function" ? configuredDamage(runtime.rng) : configuredDamage),
                            );
                            services.combat.applyNpcDamageToPlayer(source, player, HITMARK_DAMAGE, damage, tick);
                            if (params.effect?.disablePrayers) {
                                player.prayer.setActivePrayers([]);
                                player.prayer.setQuickPrayersEnabled(false);
                            }
                            if ((params.effect?.stunTicks ?? 0) > 0) {
                                services.combat.stunPlayer(player, Math.trunc(params.effect!.stunTicks!));
                            }
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
