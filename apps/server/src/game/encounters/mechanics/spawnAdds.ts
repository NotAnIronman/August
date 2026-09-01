import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import { createMechanicHandle, type MechanicHandle } from "@server/game/encounters/mechanics/MechanicHandle";
import { registerMechanic } from "@server/game/encounters/mechanics/MechanicRegistry";
import { runMechanicCallback } from "@server/game/encounters/mechanics/MechanicSafety";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

export type AddFormation = "ring" | "line" | "scatter";

export interface SpawnAddsParams {
    readonly id?: string;
    readonly npcTypeId: number;
    readonly count: number;
    readonly formation?: AddFormation;
    readonly radius?: number;
    readonly target?: PlayerState;
    readonly lifetimeTicks?: number;
    readonly attackSpeed?: number;
}

const RING: readonly (readonly [number, number])[] = [
    [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

/** Spawns encounter-owned adds and guarantees removal on boss reset/despawn. */
export function spawnAdds(
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: SpawnAddsParams,
): MechanicHandle {
    const source = services.combat.getNpc(runtime.currentNpcRuntimeId);
    const id = params.id ?? `spawn-adds:${runtime.nextMechanicSerial()}`;
    const spawnedIds = new Set<number>();
    let expiryTaskId: number | undefined;
    let handle!: MechanicHandle;
    handle = createMechanicHandle(`${runtime.id}:${id}`, () => {
        if (expiryTaskId !== undefined) services.scheduler.cancel(expiryTaskId);
        for (const npcId of spawnedIds) services.npc.removeNpc(npcId);
        spawnedIds.clear();
        runtime.releaseMechanic(handle);
    });
    const count = Math.max(0, Math.trunc(params.count));
    if (!source || count === 0) {
        handle.cancel();
        return handle;
    }
    runtime.ownMechanic(handle);
    const radius = Math.max(1, Math.trunc(params.radius ?? 2));
    try {
        for (let index = 0; index < count; index += 1) {
            const [rawX, rawY] = RING[index % RING.length]!;
            const [dx, dy] = params.formation === "line"
                ? [index - Math.floor(count / 2), 0]
                : params.formation === "scatter"
                    ? [runtime.rng.nextInt(radius * 2 + 1) - radius, runtime.rng.nextInt(radius * 2 + 1) - radius]
                    : [rawX * radius, rawY * radius];
            const add = services.npc.spawnNpc({
                id: params.npcTypeId, x: source.tileX + dx, y: source.tileY + dy, level: source.level,
                worldViewId: source.worldViewId, ownerPlayerId: source.ownerPlayerId,
                wanderRadius: 3, isAggressive: true, aggressionRadius: 30,
                attackSpeed: params.attackSpeed, lifetimeTicks: params.lifetimeTicks,
                respawns: false,
            });
            if (!add) continue;
            spawnedIds.add(add.id);
            runtime.ownNpc(add.id);
            if (params.target) services.npc.engageCombat(add, params.target);
        }
        if ((params.lifetimeTicks ?? 0) > 0) {
            expiryTaskId = services.scheduler.after(params.lifetimeTicks!, () =>
                runMechanicCallback(runtime, handle, id, () => handle.cancel()), {
                kind: "npc",
                id: source.id,
            });
        }
    } catch (error) {
        handle.cancel();
        throw error;
    }
    return handle;
}

registerMechanic("spawn-adds", spawnAdds);
