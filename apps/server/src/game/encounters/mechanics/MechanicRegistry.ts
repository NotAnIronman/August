import { logger } from "@server/observability/logger";
import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import type { ScriptServices } from "@server/game/scripts/types";
import { createInactiveMechanicHandle, type MechanicHandle } from "@server/game/encounters/mechanics/MechanicHandle";

export type EncounterMechanic<TParams = unknown> = (
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: TParams,
) => MechanicHandle;

interface MechanicRegistration {
    readonly mechanic: EncounterMechanic;
    readonly activeHandles: Set<MechanicHandle>;
}

/** Open registry for shared, independently-versioned encounter mechanics. */
export class MechanicRegistry {
    static readonly shared = new MechanicRegistry();

    private readonly mechanics = new Map<string, MechanicRegistration>();

    register<TParams>(id: string, mechanic: EncounterMechanic<TParams>): () => void {
        const normalized = id.trim();
        if (!normalized) throw new Error("Encounter mechanic id cannot be empty.");
        if (this.mechanics.has(normalized)) {
            throw new Error(`Encounter mechanic '${normalized}' is already registered.`);
        }
        const registered: MechanicRegistration = {
            mechanic: mechanic as EncounterMechanic,
            activeHandles: new Set(),
        };
        this.mechanics.set(normalized, registered);
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            if (this.mechanics.get(normalized) === registered) this.mechanics.delete(normalized);
            for (const handle of [...registered.activeHandles]) {
                try {
                    handle.cancel();
                } catch (error) {
                    logger.warn(
                        `[encounter] mechanic '${normalized}' failed during unregistration`,
                        error,
                    );
                }
            }
            registered.activeHandles.clear();
        };
    }

    get<TParams>(id: string): EncounterMechanic<TParams> | undefined {
        return this.mechanics.get(id.trim())?.mechanic as EncounterMechanic<TParams> | undefined;
    }

    has(id: string): boolean {
        return this.mechanics.has(id.trim());
    }

    run<TParams>(
        id: string,
        runtime: EncounterRuntime,
        services: ScriptServices,
        params: TParams,
    ): MechanicHandle {
        const normalized = id.trim();
        const registration = this.mechanics.get(normalized);
        if (!registration) {
            logger.warn(`[encounter] unknown mechanic '${id}' requested by ${runtime.id}`);
            return createInactiveMechanicHandle("mechanic-noop");
        }
        for (const handle of [...registration.activeHandles]) {
            if (!handle.isActive) handle.cancel();
        }
        try {
            const source = (registration.mechanic as EncounterMechanic<TParams>)(
                runtime,
                services,
                params,
            );
            if (!source.isActive) return source;
            if (this.mechanics.get(normalized) !== registration) {
                source.cancel();
                return source;
            }

            let tracked = true;
            let stopObservingSource: (() => void) | undefined;
            let handle!: MechanicHandle;
            handle = Object.freeze({
                id: source.id,
                get isActive(): boolean {
                    return tracked && source.isActive;
                },
                cancel(): void {
                    if (!tracked) return;
                    tracked = false;
                    registration.activeHandles.delete(handle);
                    stopObservingSource?.();
                    stopObservingSource = undefined;
                    try {
                        source.cancel();
                    } finally {
                        runtime.releaseMechanic(handle);
                    }
                },
            });
            registration.activeHandles.add(handle);
            stopObservingSource = source.onCancelled?.(() => handle.cancel());
            if (!source.isActive) handle.cancel();
            return handle;
        } catch (err) {
            // Mechanics are optional encounter behavior; one failure must never
            // terminate the world tick or break another active encounter.
            logger.warn(`[encounter] mechanic '${id}' failed for ${runtime.id}`, err);
            return createInactiveMechanicHandle("mechanic-noop");
        }
    }
}

export function registerMechanic<TParams>(
    id: string,
    mechanic: EncounterMechanic<TParams>,
): () => void {
    return MechanicRegistry.shared.register(id, mechanic);
}

export interface MechanicRegistrationOwner {
    registerCleanup(cleanup: () => void): unknown;
}

/** Registers a content-provided mechanic for exactly one provider lifetime. */
export function registerOwnedMechanic<TParams>(
    owner: MechanicRegistrationOwner,
    id: string,
    mechanic: EncounterMechanic<TParams>,
): EncounterMechanic<TParams> {
    const unregister = MechanicRegistry.shared.register(id, mechanic);
    try {
        owner.registerCleanup(unregister);
    } catch (error) {
        unregister();
        throw error;
    }
    return mechanic;
}
