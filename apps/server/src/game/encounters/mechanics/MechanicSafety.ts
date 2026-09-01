import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import type { MechanicHandle } from "@server/game/encounters/mechanics/MechanicHandle";
import { logger } from "@server/observability/logger";

/** Prevent an asynchronous mechanic callback from taking down the world tick. */
export function runMechanicCallback(
    runtime: EncounterRuntime,
    handle: MechanicHandle,
    id: string,
    callback: () => void,
): void {
    try {
        callback();
    } catch (error) {
        logger.warn(`[encounter] mechanic '${id}' callback failed for ${runtime.id}`, error);
        try {
            handle.cancel();
        } catch {
            // The original failure is the useful error; cleanup is best-effort.
        }
    }
}
