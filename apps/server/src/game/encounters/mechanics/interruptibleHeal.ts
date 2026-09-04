import type { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import { createInactiveMechanicHandle, createMechanicHandle, type MechanicHandle } from "@server/game/encounters/mechanics/MechanicHandle";
import { registerMechanic } from "@server/game/encounters/mechanics/MechanicRegistry";
import { runMechanicCallback } from "@server/game/encounters/mechanics/MechanicSafety";
import type { ScriptServices } from "@server/game/scripts/types";

export interface InterruptibleHealParams {
    readonly id?: string;
    readonly amount: number | ((rng: EncounterRandom) => number);
    readonly intervalTicks: number;
    /** Omit for an ongoing heal which must be cancelled by encounter content. */
    readonly durationTicks?: number;
    readonly graphicId?: number;
}

/** Heals the encounter NPC until cancelled, interrupted, or its duration ends. */
export function interruptibleHeal(
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: InterruptibleHealParams,
): MechanicHandle {
    const source = services.combat.getNpc(runtime.currentNpcRuntimeId);
    if (!source) return createInactiveMechanicHandle(`${runtime.id}:interruptible-heal:noop`);
    const id = params.id ?? `interruptible-heal:${runtime.nextMechanicSerial()}`;
    const interval = Math.max(1, Math.trunc(params.intervalTicks));
    const duration = params.durationTicks === undefined
        ? undefined
        : Math.max(0, Math.trunc(params.durationTicks));
    const taskIds = new Set<number>();
    let elapsed = 0;
    let handle!: MechanicHandle;
    const scheduleNext = (): void => {
        const remaining = duration === undefined ? interval : duration - elapsed;
        if (remaining <= 0) {
            handle.cancel();
            return;
        }
        const delay = Math.min(interval, remaining);
        let taskId = -1;
        taskId = services.scheduler.after(delay, () => runMechanicCallback(runtime, handle, id, () => {
            taskIds.delete(taskId);
            if (!handle.isActive || source.getHitpoints() <= 0) {
                handle.cancel();
                return;
            }
            if (duration !== undefined && elapsed + interval > duration) {
                handle.cancel();
                return;
            }
            const amount = Math.max(0, Math.trunc(
                typeof params.amount === "function" ? params.amount(runtime.rng) : params.amount,
            ));
            source.heal(amount);
            if (params.graphicId !== undefined) services.npc.queueNpcSpotAnim(source, params.graphicId);
            elapsed += interval;
            if (duration !== undefined && elapsed >= duration) handle.cancel();
            else scheduleNext();
        }), { kind: "npc", id: source.id });
        taskIds.add(taskId);
    };
    handle = createMechanicHandle(`${runtime.id}:${id}`, () => {
        for (const taskId of taskIds) services.scheduler.cancel(taskId);
        taskIds.clear();
        runtime.releaseMechanic(handle);
    });
    runtime.ownMechanic(handle);
    scheduleNext();
    return handle;
}

registerMechanic("interruptible-heal", interruptibleHeal);
