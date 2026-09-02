import { logger } from "@server/observability/logger";
import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import type { ScriptServices } from "@server/game/scripts/types";
import { createInactiveMechanicHandle, type MechanicHandle } from "@server/game/encounters/mechanics/MechanicHandle";

export type EncounterMechanic<TParams = unknown> = (
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: TParams,
) => MechanicHandle;

/** Open registry for shared, independently-versioned encounter mechanics. */
export class MechanicRegistry {
    static readonly shared = new MechanicRegistry();

    private readonly mechanics = new Map<string, EncounterMechanic>();

    register<TParams>(id: string, mechanic: EncounterMechanic<TParams>): void {
        const normalized = id.trim();
        if (!normalized) throw new Error("Encounter mechanic id cannot be empty.");
        if (this.mechanics.has(normalized)) {
            throw new Error(`Encounter mechanic '${normalized}' is already registered.`);
        }
        this.mechanics.set(normalized, mechanic as EncounterMechanic);
    }

    get<TParams>(id: string): EncounterMechanic<TParams> | undefined {
        return this.mechanics.get(id.trim()) as EncounterMechanic<TParams> | undefined;
    }

    run<TParams>(
        id: string,
        runtime: EncounterRuntime,
        services: ScriptServices,
        params: TParams,
    ): MechanicHandle {
        const mechanic = this.get<TParams>(id);
        if (!mechanic) {
            logger.warn(`[encounter] unknown mechanic '${id}' requested by ${runtime.id}`);
            return createInactiveMechanicHandle("mechanic-noop");
        }
        try {
            return mechanic(runtime, services, params);
        } catch (err) {
            // Mechanics are optional encounter behavior; one failure must never
            // terminate the world tick or break another active encounter.
            logger.warn(`[encounter] mechanic '${id}' failed for ${runtime.id}`, err);
            return createInactiveMechanicHandle("mechanic-noop");
        }
    }
}

export function registerMechanic<TParams>(id: string, mechanic: EncounterMechanic<TParams>): void {
    MechanicRegistry.shared.register(id, mechanic);
}
