import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import { createInactiveMechanicHandle, createMechanicHandle, type MechanicHandle } from "@server/game/encounters/mechanics/MechanicHandle";
import { registerMechanic } from "@server/game/encounters/mechanics/MechanicRegistry";
import { runMechanicCallback } from "@server/game/encounters/mechanics/MechanicSafety";
import type { ScriptServices } from "@server/game/scripts/types";

export interface DamageCapParams {
    readonly id?: string;
    readonly maximumHit: number;
    readonly durationTicks?: number;
}

/** Caps a player's individual hit against the encounter NPC. */
export function damageCap(
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: DamageCapParams,
): MechanicHandle {
    const source = services.combat.getNpc(runtime.currentNpcRuntimeId);
    if (!source) return createInactiveMechanicHandle(`${runtime.id}:damage-cap:noop`);
    const id = params.id ?? `damage-cap:${runtime.nextMechanicSerial()}`;
    const previousCap = source.incomingPlayerDamageCap;
    let taskId: number | undefined;
    let handle!: MechanicHandle;
    handle = createMechanicHandle(`${runtime.id}:${id}`, () => {
        if (taskId !== undefined) services.scheduler.cancel(taskId);
        source.incomingPlayerDamageCap = previousCap;
        runtime.releaseMechanic(handle);
    });
    source.incomingPlayerDamageCap = Math.max(0, Math.trunc(params.maximumHit));
    runtime.ownMechanic(handle);
    if (params.durationTicks !== undefined) {
        taskId = services.scheduler.after(Math.max(0, Math.trunc(params.durationTicks)), () =>
            runMechanicCallback(runtime, handle, id, () => handle.cancel()), {
            kind: "npc", id: source.id,
        });
    }
    return handle;
}

registerMechanic("damage-cap", damageCap);
