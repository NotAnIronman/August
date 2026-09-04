import { AttackType, type AttackType as AttackTypeValue } from "@server/game/combat/AttackType";
import type {
    BossMechanicBinding,
    EveryAttacksTrigger,
} from "@server/game/encounters/BossMechanics";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type {
    EncounterAttackDefinition,
    EncounterDefinition,
    EncounterPhaseDefinition,
} from "@server/game/encounters/EncounterTypes";
import { MechanicRegistry } from "@server/game/encounters/mechanics/MechanicRegistry";

type BossMechanicBindings = Readonly<Record<string, BossMechanicBinding<any>>>;

export type DeclarativeBossDefinition<
    TMechanics extends BossMechanicBindings = BossMechanicBindings,
> = EncounterDefinition & {
    readonly mechanics?: TMechanics;
};

type AttackOptions = Omit<EncounterAttackDefinition, "id" | "type" | "rangeTiles" | "speedTicks"> & {
    readonly id?: string;
    readonly rangeTiles?: number;
    readonly speedTicks?: number;
};

function createAttack(
    type: AttackTypeValue,
    options: AttackOptions,
): EncounterAttackDefinition {
    const id = options.id?.trim() || type;
    const rangeTiles = options.rangeTiles ?? (type === AttackType.Melee ? 1 : 10);
    const speedTicks = options.speedTicks ?? 4;
    const preferredDistance = options.preferredDistance ??
        (type === AttackType.Melee ? 1 : undefined);
    const maxDistance = options.maxDistance ??
        (type === AttackType.Melee && options.rangeTiles === undefined ? rangeTiles : undefined);
    return Object.freeze({
        ...options,
        id,
        type,
        rangeTiles,
        speedTicks,
        preferredDistance,
        maxDistance,
    });
}

export const attack = Object.freeze({
    melee(options: AttackOptions = {}): EncounterAttackDefinition {
        return createAttack(AttackType.Melee, options);
    },
    ranged(options: AttackOptions = {}): EncounterAttackDefinition {
        return createAttack(AttackType.Ranged, options);
    },
    magic(options: AttackOptions = {}): EncounterAttackDefinition {
        return createAttack(AttackType.Magic, options);
    },
    of(type: AttackTypeValue, options: AttackOptions = {}): EncounterAttackDefinition {
        return createAttack(type, options);
    },
});

export const phase = Object.freeze({
    atHealth(
        id: string,
        startsAtHealthPercent: number,
        attackIds?: readonly string[],
    ): EncounterPhaseDefinition {
        return Object.freeze({ id, startsAtHealthPercent, attackIds });
    },
});

function validateMechanics(definition: DeclarativeBossDefinition): void {
    const bindings = definition.mechanics ? Object.values(definition.mechanics) : [];
    const ids = bindings.map((binding) => binding.id);
    if (new Set(ids).size !== ids.length) {
        throw new Error(`Mechanic id in '${definition.id}' values must be unique.`);
    }
    const attackIds = new Set(definition.attacks.map((entry) => entry.id));
    const phaseIds = new Set((definition.phases ?? []).map((entry) => entry.id));
    for (const binding of bindings) {
        const mechanicRegistry = binding.mechanicRegistry ?? MechanicRegistry.shared;
        if (binding.mechanicId && !mechanicRegistry.has(binding.mechanicId)) {
            throw new Error(
                `Mechanic '${binding.id}' references unknown mechanic '${binding.mechanicId}'.`,
            );
        }
        if (binding.trigger.kind !== "every-attacks") continue;
        const trigger = binding.trigger as EveryAttacksTrigger;
        for (const attackId of trigger.attackIds ?? []) {
            if (!attackIds.has(attackId)) {
                throw new Error(
                    `Mechanic '${binding.id}' references unknown attack '${attackId}'.`,
                );
            }
        }
        for (const phaseId of trigger.phaseIds ?? []) {
            if (!phaseIds.has(phaseId)) {
                throw new Error(
                    `Mechanic '${binding.id}' references unknown phase '${phaseId}'.`,
                );
            }
        }
    }
}

/** Freeze every mutable definition-owned container without freezing registry dependencies. */
function freezeBossDefinition<
    const TDefinition extends DeclarativeBossDefinition,
>(definition: TDefinition): TDefinition {
    Object.freeze(definition.npcTypeIds);
    for (const entry of definition.attacks) {
        if (entry.effects) Object.freeze(entry.effects);
        if (typeof entry.animation === "object") Object.freeze(entry.animation);
        Object.freeze(entry);
    }
    Object.freeze(definition.attacks);
    for (const entry of definition.phases ?? []) {
        if (entry.attackIds) Object.freeze(entry.attackIds);
        Object.freeze(entry);
    }
    if (definition.phases) Object.freeze(definition.phases);
    for (const entry of definition.thresholds ?? []) Object.freeze(entry);
    if (definition.thresholds) Object.freeze(definition.thresholds);
    if (definition.movement) Object.freeze(definition.movement);
    if (definition.immunities) Object.freeze(definition.immunities);
    if (definition.bossHealthBar) {
        for (const marker of definition.bossHealthBar.markers ?? []) Object.freeze(marker);
        if (definition.bossHealthBar.markers) {
            Object.freeze(definition.bossHealthBar.markers);
        }
        Object.freeze(definition.bossHealthBar);
    }
    if (definition.killcount) Object.freeze(definition.killcount);
    if (definition.mechanics) {
        for (const binding of Object.values(definition.mechanics)) {
            if (binding.trigger.kind === "every-attacks") {
                if (binding.trigger.attackIds) Object.freeze(binding.trigger.attackIds);
                if (binding.trigger.phaseIds) Object.freeze(binding.trigger.phaseIds);
            }
            Object.freeze(binding.trigger);
            Object.freeze(binding);
        }
        Object.freeze(definition.mechanics);
    }
    return Object.freeze(definition);
}

/**
 * Defines and validates one boss against the same contract used by the live
 * encounter registry. Registration remains provider-owned and explicit.
 */
export function defineBoss<
    const TDefinition extends DeclarativeBossDefinition,
>(definition: TDefinition): TDefinition {
    new EncounterRegistry().register(definition);
    validateMechanics(definition);
    return freezeBossDefinition(definition);
}
