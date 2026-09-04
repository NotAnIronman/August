import type { EncounterRuntime, MechanicReentrancyPolicy } from "@server/game/encounters/EncounterRuntime";
import {
    createInactiveMechanicHandle,
    type MechanicHandle,
} from "@server/game/encounters/mechanics/MechanicHandle";
import {
    MechanicRegistry,
    type EncounterMechanic,
} from "@server/game/encounters/mechanics/MechanicRegistry";
import { damageCap, type DamageCapParams } from "@server/game/encounters/mechanics/damageCap";
import { delayedImpact, type DelayedImpactParams } from "@server/game/encounters/mechanics/delayedImpact";
import { enrageTimer, type EnrageTimerParams } from "@server/game/encounters/mechanics/enrageTimer";
import {
    interruptibleHeal,
    type InterruptibleHealParams,
} from "@server/game/encounters/mechanics/interruptibleHeal";
import {
    invulnerabilityWindow,
    type InvulnerabilityWindowParams,
} from "@server/game/encounters/mechanics/invulnerabilityWindow";
import {
    freezeBindHit,
    type FreezeBindHitParams,
    knockback,
    type KnockbackParams,
    prayerDrainHit,
    type PrayerDrainHitParams,
    statDrainHit,
    type StatDrainHitParams,
    stunHit,
    type StunHitParams,
} from "@server/game/encounters/mechanics/playerEffects";
import { spawnAdds, type SpawnAddsParams } from "@server/game/encounters/mechanics/spawnAdds";
import {
    spawnFloorHazard,
    type FloorHazardParams,
} from "@server/game/encounters/mechanics/spawnFloorHazard";
import type { ScriptServices } from "@server/game/scripts/types";

export interface BossMechanicEvent {
    /** The prepared attack which caused this invocation, when applicable. */
    readonly attackId?: string;
    /** Defaults to the runtime's current phase when omitted. */
    readonly phaseId?: string;
}

export interface EveryAttacksTrigger {
    readonly kind: "every-attacks";
    readonly every: number;
    /** Zero means every Nth matching attack; one means the first, then every Nth. */
    readonly offset: number;
    readonly attackIds?: readonly string[];
    readonly phaseIds?: readonly string[];
}

export interface ManualBossMechanicTrigger {
    readonly kind: "manual";
}

export type BossMechanicTrigger = ManualBossMechanicTrigger | EveryAttacksTrigger;

export interface BossMechanicContext<TInput> {
    readonly runtime: EncounterRuntime;
    readonly services: ScriptServices;
    readonly input: TInput;
}

export interface BossMechanicRunResult {
    /** False means the declaration's cadence/filter rejected this event. */
    readonly triggered: boolean;
    readonly eventCount?: number;
    readonly handle?: MechanicHandle;
}

export interface BossMechanicBinding<TInput = void> {
    readonly id: string;
    readonly mechanicId?: string;
    /** Registry used to validate and dynamically resolve registered extensions. */
    readonly mechanicRegistry?: MechanicRegistry;
    readonly reentrancy: MechanicReentrancyPolicy;
    readonly trigger: BossMechanicTrigger;
    run(
        runtime: EncounterRuntime,
        services: ScriptServices,
        input: TInput,
    ): BossMechanicRunResult;
    reset(runtime: EncounterRuntime): void;
}

type ParamsResolver<TInput, TParams> =
    | TParams
    | ((context: BossMechanicContext<TInput>) => TParams);

interface SharedMechanicOptions<TInput, TParams> {
    readonly id: string;
    readonly reentrancy?: MechanicReentrancyPolicy;
    readonly trigger?: BossMechanicTrigger;
    readonly params: ParamsResolver<TInput, TParams>;
}

interface CustomMechanicOptions<TInput> {
    readonly id: string;
    readonly reentrancy?: MechanicReentrancyPolicy;
    readonly trigger?: BossMechanicTrigger;
    /** Bespoke choreography stays explicit but gains standard ownership/re-entrancy. */
    readonly execute: (context: BossMechanicContext<TInput>) => MechanicHandle | void;
}

interface EveryAttacksOptions {
    readonly offset?: number;
    readonly attackIds?: readonly string[];
    readonly phaseIds?: readonly string[];
}

function validateIdentifier(value: string, label: string): string {
    const normalized = value.trim();
    if (!normalized) throw new Error(`${label} cannot be empty.`);
    return normalized;
}

function validateReferences(values: readonly string[] | undefined, label: string): void {
    if (!values) return;
    const normalized = values.map((value) => validateIdentifier(value, label));
    if (new Set(normalized).size !== normalized.length) {
        throw new Error(`${label} values must be unique.`);
    }
}

function validateTrigger(trigger: BossMechanicTrigger): void {
    if (trigger.kind !== "every-attacks") return;
    if (!Number.isInteger(trigger.every) || trigger.every <= 0) {
        throw new Error("Boss mechanic attack interval must be a positive integer.");
    }
    if (!Number.isInteger(trigger.offset) || trigger.offset < 0 || trigger.offset >= trigger.every) {
        throw new Error("Boss mechanic attack offset must be between zero and interval - 1.");
    }
    validateReferences(trigger.attackIds, "Boss mechanic attack id");
    validateReferences(trigger.phaseIds, "Boss mechanic phase id");
}

function evaluateTrigger<TInput>(
    bindingId: string,
    trigger: BossMechanicTrigger,
    runtime: EncounterRuntime,
    input: TInput,
): { readonly triggered: boolean; readonly eventCount?: number } {
    if (
        runtime.lifecycle === "dead" ||
        runtime.lifecycle === "disposed" ||
        runtime.lifecycle === "resetting"
    ) {
        return { triggered: false };
    }
    if (trigger.kind === "manual") return { triggered: true };

    const event = input as BossMechanicEvent | undefined;
    if (trigger.attackIds && !trigger.attackIds.includes(event?.attackId ?? "")) {
        return { triggered: false };
    }
    if (trigger.phaseIds && !trigger.phaseIds.includes(event?.phaseId ?? runtime.phaseId)) {
        return { triggered: false };
    }

    const eventCount = runtime.advanceMechanicEvent(`declarative:${bindingId}`);
    if (eventCount === undefined) return { triggered: false };
    const triggered = trigger.offset === 0
        ? eventCount % trigger.every === 0
        : eventCount >= trigger.offset && (eventCount - trigger.offset) % trigger.every === 0;
    return { triggered, eventCount };
}

function createBinding<TInput, TParams>(
    options: SharedMechanicOptions<TInput, TParams>,
    mechanicId: string,
    factory: EncounterMechanic<TParams>,
): BossMechanicBinding<TInput> {
    const id = validateIdentifier(options.id, "Boss mechanic binding id");
    const trigger = options.trigger ?? Object.freeze({ kind: "manual" as const });
    validateTrigger(trigger);
    const reentrancy = options.reentrancy ?? "replace";
    return Object.freeze({
        id,
        mechanicId,
        reentrancy,
        trigger,
        reset(runtime: EncounterRuntime): void {
            runtime.resetMechanicEvent(`declarative:${id}`);
        },
        run(runtime: EncounterRuntime, services: ScriptServices, input: TInput): BossMechanicRunResult {
            const decision = evaluateTrigger(id, trigger, runtime, input);
            if (!decision.triggered) return decision;
            const handle = runtime.runMechanic(id, reentrancy, () => {
                const context = { runtime, services, input } satisfies BossMechanicContext<TInput>;
                const params = typeof options.params === "function"
                    ? (options.params as (value: BossMechanicContext<TInput>) => TParams)(context)
                    : options.params;
                return factory(runtime, services, params);
            });
            return { ...decision, handle };
        },
    });
}

function createCustomBinding<TInput>(
    options: CustomMechanicOptions<TInput>,
): BossMechanicBinding<TInput> {
    const id = validateIdentifier(options.id, "Boss mechanic binding id");
    const trigger = options.trigger ?? Object.freeze({ kind: "manual" as const });
    validateTrigger(trigger);
    const reentrancy = options.reentrancy ?? "replace";
    return Object.freeze({
        id,
        reentrancy,
        trigger,
        reset(runtime: EncounterRuntime): void {
            runtime.resetMechanicEvent(`declarative:${id}`);
        },
        run(runtime: EncounterRuntime, services: ScriptServices, input: TInput): BossMechanicRunResult {
            const decision = evaluateTrigger(id, trigger, runtime, input);
            if (!decision.triggered) return decision;
            const handle = runtime.runMechanic(id, reentrancy, () =>
                options.execute({ runtime, services, input }) ??
                createInactiveMechanicHandle(`${runtime.id}:${id}:complete`),
            );
            return { ...decision, handle };
        },
    });
}

function createRegisteredBinding<TInput, TParams>(
    mechanicId: string,
    options: SharedMechanicOptions<TInput, TParams>,
    registry: MechanicRegistry,
): BossMechanicBinding<TInput> {
    const id = validateIdentifier(options.id, "Boss mechanic binding id");
    const trigger = options.trigger ?? Object.freeze({ kind: "manual" as const });
    validateTrigger(trigger);
    const reentrancy = options.reentrancy ?? "replace";
    return Object.freeze({
        id,
        mechanicId,
        mechanicRegistry: registry,
        reentrancy,
        trigger,
        reset(runtime: EncounterRuntime): void {
            runtime.resetMechanicEvent(`declarative:${id}`);
        },
        run(runtime: EncounterRuntime, services: ScriptServices, input: TInput): BossMechanicRunResult {
            const decision = evaluateTrigger(id, trigger, runtime, input);
            if (!decision.triggered) return decision;
            const handle = runtime.runMechanic(id, reentrancy, () => {
                const context = { runtime, services, input } satisfies BossMechanicContext<TInput>;
                const params = typeof options.params === "function"
                    ? (options.params as (value: BossMechanicContext<TInput>) => TParams)(context)
                    : options.params;
                // Resolve on every run: a provider reload may replace or remove
                // this extension while an older definition/runtime still exists.
                return registry.run(mechanicId, runtime, services, params);
            });
            return { ...decision, handle };
        },
    });
}

/**
 * Validates a named set once and preserves each binding's input type. The
 * object keys are local ergonomic names; lifecycle identity comes from the
 * declaration's globally meaningful `id`.
 */
export function defineBossMechanics<
    const TBindings extends Readonly<Record<string, BossMechanicBinding<unknown>>>,
>(bindings: TBindings): TBindings {
    const ids = Object.values(bindings).map((binding) => binding.id);
    if (new Set(ids).size !== ids.length) {
        throw new Error("Boss mechanic binding ids must be unique.");
    }
    return Object.freeze({ ...bindings }) as TBindings;
}

export const mechanic = Object.freeze({
    everyAttacks(every: number, options: EveryAttacksOptions = {}): EveryAttacksTrigger {
        const trigger = Object.freeze({
            kind: "every-attacks" as const,
            every,
            offset: options.offset ?? 0,
            attackIds: options.attackIds,
            phaseIds: options.phaseIds,
        });
        validateTrigger(trigger);
        return trigger;
    },

    floorHazard<TInput = void>(
        options: SharedMechanicOptions<TInput, FloorHazardParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "spawn-floor-hazard", spawnFloorHazard);
    },

    spawnAdds<TInput = void>(
        options: SharedMechanicOptions<TInput, SpawnAddsParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "spawn-adds", spawnAdds);
    },

    interruptibleHeal<TInput = void>(
        options: SharedMechanicOptions<TInput, InterruptibleHealParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "interruptible-heal", interruptibleHeal);
    },

    enrage<TInput = void>(
        options: SharedMechanicOptions<TInput, EnrageTimerParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "enrage-timer", enrageTimer);
    },

    invulnerability<TInput = void>(
        options: SharedMechanicOptions<TInput, InvulnerabilityWindowParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "invulnerability-window", invulnerabilityWindow);
    },

    damageCap<TInput = void>(
        options: SharedMechanicOptions<TInput, DamageCapParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "damage-cap", damageCap);
    },

    delayedImpact<TInput = void>(
        options: SharedMechanicOptions<TInput, DelayedImpactParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "delayed-impact", delayedImpact);
    },

    statDrain<TInput = void>(
        options: SharedMechanicOptions<TInput, StatDrainHitParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "stat-drain-hit", statDrainHit);
    },

    prayerDrain<TInput = void>(
        options: SharedMechanicOptions<TInput, PrayerDrainHitParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "prayer-drain-hit", prayerDrainHit);
    },

    freeze<TInput = void>(
        options: SharedMechanicOptions<TInput, FreezeBindHitParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "freeze-bind-hit", freezeBindHit);
    },

    stun<TInput = void>(
        options: SharedMechanicOptions<TInput, StunHitParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "stun-hit", stunHit);
    },

    knockback<TInput = void>(
        options: SharedMechanicOptions<TInput, KnockbackParams>,
    ): BossMechanicBinding<TInput> {
        return createBinding(options, "knockback", knockback);
    },

    registered<TInput = void, TParams = unknown>(
        mechanicId: string,
        options: SharedMechanicOptions<TInput, TParams>,
        registry: MechanicRegistry = MechanicRegistry.shared,
    ): BossMechanicBinding<TInput> {
        const normalized = validateIdentifier(mechanicId, "Registered boss mechanic id");
        if (!registry.has(normalized)) throw new Error(`Unknown encounter mechanic '${normalized}'.`);
        return createRegisteredBinding(normalized, options, registry);
    },

    custom<TInput = void>(options: CustomMechanicOptions<TInput>): BossMechanicBinding<TInput> {
        return createCustomBinding(options);
    },
});
