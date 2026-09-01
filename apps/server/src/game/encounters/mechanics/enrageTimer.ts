import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import { createInactiveMechanicHandle, createMechanicHandle, type MechanicHandle } from "@server/game/encounters/mechanics/MechanicHandle";
import { registerMechanic } from "@server/game/encounters/mechanics/MechanicRegistry";
import { runMechanicCallback } from "@server/game/encounters/mechanics/MechanicSafety";
import type { ScriptServices } from "@server/game/scripts/types";

export interface EnrageTimerParams {
    readonly id?: string;
    readonly delayTicks: number;
    readonly onEnrage: (context: { runtime: EncounterRuntime; tick: number }) => void;
}

/** Runs one deterministic soft or hard enrage callback after its delay. */
export function enrageTimer(
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: EnrageTimerParams,
): MechanicHandle {
    const source = services.combat.getNpc(runtime.currentNpcRuntimeId);
    if (!source) return createInactiveMechanicHandle(`${runtime.id}:enrage-timer:noop`);
    const id = params.id ?? `enrage-timer:${runtime.nextMechanicSerial()}`;
    let taskId: number | undefined;
    let handle!: MechanicHandle;
    handle = createMechanicHandle(`${runtime.id}:${id}`, () => {
        if (taskId !== undefined) services.scheduler.cancel(taskId);
        runtime.releaseMechanic(handle);
    });
    runtime.ownMechanic(handle);
    taskId = services.scheduler.after(Math.max(0, Math.trunc(params.delayTicks)), (tick) => runMechanicCallback(runtime, handle, id, () => {
        taskId = undefined;
        if (!handle.isActive || source.getHitpoints() <= 0) {
            handle.cancel();
            return;
        }
        try {
            params.onEnrage({ runtime, tick });
        } finally {
            handle.cancel();
        }
    }), { kind: "npc", id: source.id });
    return handle;
}

registerMechanic("enrage-timer", enrageTimer);
