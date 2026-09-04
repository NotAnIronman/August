import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import {
    createInactiveMechanicHandle,
    createMechanicHandle,
    type MechanicHandle,
} from "@server/game/encounters/mechanics/MechanicHandle";
import { registerMechanic } from "@server/game/encounters/mechanics/MechanicRegistry";
import { runMechanicCallback } from "@server/game/encounters/mechanics/MechanicSafety";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

export interface DelayedImpactProjectile {
    readonly projectileId: number;
    readonly sourceHeight?: number;
    readonly endHeight?: number;
    readonly slope?: number;
    readonly startPos?: number;
    readonly startCycleOffset?: number;
    readonly endCycleOffset?: number;
}

export interface DelayedImpactContext {
    readonly runtime: EncounterRuntime;
    readonly services: ScriptServices;
    readonly source: NpcState;
    readonly target: PlayerState;
    readonly tick: number;
}

export interface DelayedImpactParams {
    readonly id?: string;
    readonly target: PlayerState;
    readonly delayTicks: number;
    readonly projectile?: DelayedImpactProjectile;
    /** Same-plane validation defaults on; world-view validation is always on. */
    readonly requireSamePlane?: boolean;
    /** Encounter-specific validity, such as current instance membership. */
    readonly isTargetValid?: (context: DelayedImpactContext) => boolean;
    /** Runs only after every lifecycle/identity/location check succeeds. */
    readonly onImpact: (context: DelayedImpactContext) => void;
}

function canResolveImpact(
    runtime: EncounterRuntime,
    services: ScriptServices,
    source: NpcState,
    params: DelayedImpactParams,
    tick: number,
): DelayedImpactContext | undefined {
    if (runtime.lifecycle !== "idle" && runtime.lifecycle !== "engaged") return undefined;
    if (runtime.currentNpcRuntimeId !== source.id) return undefined;
    if (services.combat.getNpc(source.id) !== source || source.getHitpoints() <= 0) return undefined;
    if (params.target.worldViewId !== source.worldViewId) return undefined;
    if (params.requireSamePlane !== false && params.target.level !== source.level) return undefined;
    const context = { runtime, services, source, target: params.target, tick };
    if (params.isTargetValid && !params.isTargetValid(context)) return undefined;
    return context;
}

/**
 * Launches an optional projectile and owns its delayed impact under the
 * encounter lifetime. Impact-time callbacks can re-evaluate prayer, damage,
 * or bespoke choreography without duplicating stale-target safeguards.
 */
export function delayedImpact(
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: DelayedImpactParams,
): MechanicHandle {
    const source = services.combat.getNpc(runtime.currentNpcRuntimeId);
    const delayTicks = Math.max(0, Math.trunc(params.delayTicks));
    if (!source || !canResolveImpact(runtime, services, source, params, 0)) {
        return createInactiveMechanicHandle(`${runtime.id}:delayed-impact:noop`);
    }

    const id = params.id ?? `delayed-impact:${runtime.nextMechanicSerial()}`;
    let taskId: number | undefined;
    let handle!: MechanicHandle;
    handle = createMechanicHandle(`${runtime.id}:${id}`, () => {
        if (taskId !== undefined) services.scheduler.cancel(taskId);
        taskId = undefined;
        runtime.releaseMechanic(handle);
    });
    runtime.ownMechanic(handle);

    try {
        const projectile = params.projectile;
        if (projectile) {
            services.projectiles.launch({
                projectileId: projectile.projectileId,
                source: {
                    tileX: source.tileX,
                    tileY: source.tileY,
                    plane: source.level,
                    actor: { kind: "npc", serverId: source.id },
                },
                target: {
                    tileX: params.target.tileX,
                    tileY: params.target.tileY,
                    plane: params.target.level,
                    actor: { kind: "player", serverId: params.target.id },
                },
                sourceHeight: projectile.sourceHeight ?? 90,
                endHeight: projectile.endHeight ?? 20,
                slope: projectile.slope ?? 20,
                startPos: projectile.startPos ?? 0,
                startCycleOffset: projectile.startCycleOffset ?? 0,
                endCycleOffset: projectile.endCycleOffset ?? delayTicks * 30,
            });
        }

        taskId = services.scheduler.after(delayTicks, (tick) => {
            taskId = undefined;
            runMechanicCallback(runtime, handle, id, () => {
                if (!handle.isActive) return;
                const context = canResolveImpact(runtime, services, source, params, tick);
                if (!context) {
                    handle.cancel();
                    return;
                }
                try {
                    params.onImpact(context);
                } finally {
                    handle.cancel();
                }
            });
        }, { kind: "npc", id: source.id });
    } catch (error) {
        handle.cancel();
        throw error;
    }
    return handle;
}

registerMechanic("delayed-impact", delayedImpact);
