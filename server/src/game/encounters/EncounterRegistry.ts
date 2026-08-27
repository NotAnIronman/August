import type { EncounterDefinition } from "./EncounterTypes";

export class EncounterRegistry {
    static readonly shared = new EncounterRegistry();

    private readonly byId = new Map<string, EncounterDefinition>();
    private readonly byNpcTypeId = new Map<number, EncounterDefinition>();

    register(definition: EncounterDefinition): void {
        this.validate(definition);
        if (this.byId.has(definition.id)) {
            throw new Error(`Encounter '${definition.id}' is already registered.`);
        }
        for (const npcTypeId of definition.npcTypeIds) {
            const existing = this.byNpcTypeId.get(npcTypeId);
            if (existing) {
                throw new Error(
                    `NPC type ${npcTypeId} belongs to both '${existing.id}' and '${definition.id}'.`,
                );
            }
        }
        this.byId.set(definition.id, definition);
        for (const npcTypeId of definition.npcTypeIds) {
            this.byNpcTypeId.set(npcTypeId, definition);
        }
    }

    get(id: string): EncounterDefinition | undefined {
        return this.byId.get(id);
    }

    findByNpcTypeId(npcTypeId: number): EncounterDefinition | undefined {
        return this.byNpcTypeId.get(Math.trunc(npcTypeId));
    }

    values(): readonly EncounterDefinition[] {
        return [...this.byId.values()];
    }

    clear(): void {
        this.byId.clear();
        this.byNpcTypeId.clear();
    }

    private validate(definition: EncounterDefinition): void {
        if (!definition.id.trim()) throw new Error("Encounter id cannot be empty.");
        if (definition.npcTypeIds.length === 0) {
            throw new Error(`Encounter '${definition.id}' must declare at least one NPC type.`);
        }
        if (definition.attacks.length === 0) {
            throw new Error(`Encounter '${definition.id}' must declare at least one attack.`);
        }
        this.assertUnique(definition.npcTypeIds, `NPC type in '${definition.id}'`);
        const attackIds = definition.attacks.map((attack) => attack.id);
        this.assertUnique(attackIds, `Attack id in '${definition.id}'`);
        for (const attack of definition.attacks) {
            if (!attack.id.trim()) throw new Error(`Encounter '${definition.id}' has an empty attack id.`);
            if (!(attack.rangeTiles >= 1) || !(attack.speedTicks >= 1)) {
                throw new Error(`Attack '${attack.id}' must have positive range and speed.`);
            }
            if (
                attack.preferredDistance !== undefined &&
                (!(attack.preferredDistance >= 1) || attack.preferredDistance > attack.rangeTiles)
            ) {
                throw new Error(
                    `Attack '${attack.id}' preferred distance must be between 1 and its attack range.`,
                );
            }
            if (attack.animation !== undefined && attack.animationId !== undefined) {
                throw new Error(
                    `Attack '${attack.id}' cannot declare both animation and animationId.`,
                );
            }
            if (
                attack.animationId !== undefined &&
                (!Number.isInteger(attack.animationId) || attack.animationId <= 0)
            ) {
                throw new Error(`Attack '${attack.id}' animationId must be a positive integer.`);
            }
            if (
                typeof attack.animation === "object" &&
                (!Number.isInteger(attack.animation.special) || attack.animation.special < 0)
            ) {
                throw new Error(`Attack '${attack.id}' special animation index must be non-negative.`);
            }
            if ((attack.weight ?? 1) < 0 || (attack.cooldownTicks ?? 0) < 0) {
                throw new Error(`Attack '${attack.id}' has a negative weight or cooldown.`);
            }
        }
        const phases = definition.phases ?? [];
        this.assertUnique(phases.map((phase) => phase.id), `Phase id in '${definition.id}'`);
        for (const phase of phases) {
            this.assertPercent(phase.startsAtHealthPercent, `Phase '${phase.id}'`);
            for (const attackId of phase.attackIds ?? []) {
                if (!attackIds.includes(attackId)) {
                    throw new Error(`Phase '${phase.id}' references unknown attack '${attackId}'.`);
                }
            }
        }
        const thresholds = definition.thresholds ?? [];
        this.assertUnique(
            thresholds.map((threshold) => threshold.id),
            `Threshold id in '${definition.id}'`,
        );
        for (const threshold of thresholds) {
            this.assertPercent(threshold.atHealthPercent, `Threshold '${threshold.id}'`);
        }
    }

    private assertPercent(value: number, label: string): void {
        if (!Number.isFinite(value) || value < 0 || value > 100) {
            throw new Error(`${label} health percentage must be between 0 and 100.`);
        }
    }

    private assertUnique<T>(values: readonly T[], label: string): void {
        if (new Set(values).size !== values.length) throw new Error(`${label} values must be unique.`);
    }
}

export function registerEncounter(definition: EncounterDefinition): EncounterDefinition {
    EncounterRegistry.shared.register(definition);
    return definition;
}
