import {
    BOSS_HEALTH_BAR_MARKER_STYLES,
    BOSS_HEALTH_BAR_MAX_MARKER_LABEL_LENGTH,
} from "@august/protocol/ui/bossHealthBar";
import { normalizeNpcSpecialName } from "@server/game/npc/NpcCombatAnimationData";
import type { EncounterDefinition } from "@server/game/encounters/EncounterTypes";
import { logger } from "@server/observability/logger";

export type EncounterUnregistrationListener = (definition: EncounterDefinition) => void;

export class EncounterRegistry {
    static readonly shared = new EncounterRegistry();

    private readonly byId = new Map<string, EncounterDefinition>();
    private readonly byNpcTypeId = new Map<number, EncounterDefinition>();
    private readonly unregistrationListeners = new Set<EncounterUnregistrationListener>();

    register(definition: EncounterDefinition): () => void {
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
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            this.unregister(definition);
        };
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

    /** Observes removal of the exact definition object that was registered. */
    onUnregistered(listener: EncounterUnregistrationListener): () => void {
        this.unregistrationListeners.add(listener);
        return () => this.unregistrationListeners.delete(listener);
    }

    /** Removes only the exact registration supplied, protecting replacements from stale cleanup. */
    unregister(definition: EncounterDefinition): boolean {
        if (this.byId.get(definition.id) !== definition) return false;
        this.byId.delete(definition.id);
        for (const npcTypeId of definition.npcTypeIds) {
            if (this.byNpcTypeId.get(npcTypeId) === definition) {
                this.byNpcTypeId.delete(npcTypeId);
            }
        }
        this.notifyUnregistered(definition);
        return true;
    }

    clear(): void {
        const definitions = [...this.byId.values()];
        this.byId.clear();
        this.byNpcTypeId.clear();
        for (const definition of definitions) this.notifyUnregistered(definition);
    }

    private notifyUnregistered(definition: EncounterDefinition): void {
        for (const listener of [...this.unregistrationListeners]) {
            try {
                listener(definition);
            } catch (error) {
                logger.warn(
                    `[encounter] unregistration listener failed for '${definition.id}'`,
                    error,
                );
            }
        }
    }

    private validate(definition: EncounterDefinition): void {
        if (!definition.id.trim()) throw new Error("Encounter id cannot be empty.");
        if (definition.npcTypeIds.length === 0) {
            throw new Error(`Encounter '${definition.id}' must declare at least one NPC type.`);
        }
        for (const npcTypeId of definition.npcTypeIds) {
            if (!Number.isInteger(npcTypeId) || npcTypeId <= 0) {
                throw new Error(`Encounter '${definition.id}' NPC types must be positive integers.`);
            }
        }
        if (definition.attacks.length === 0) {
            throw new Error(`Encounter '${definition.id}' must declare at least one attack.`);
        }
        if (
            definition.maxHealth !== undefined &&
            (!Number.isInteger(definition.maxHealth) || definition.maxHealth <= 0)
        ) {
            throw new Error(`Encounter '${definition.id}' max health must be a positive integer.`);
        }
        this.assertUnique(definition.npcTypeIds, `NPC type in '${definition.id}'`);
        const bossHealthBar = definition.bossHealthBar;
        if (bossHealthBar) {
            if (!bossHealthBar.name.trim()) {
                throw new Error(`Encounter '${definition.id}' boss health bar name cannot be empty.`);
            }
            if (
                bossHealthBar.npcTypeId !== undefined &&
                (!Number.isInteger(bossHealthBar.npcTypeId) ||
                    !definition.npcTypeIds.includes(bossHealthBar.npcTypeId))
            ) {
                throw new Error(
                    `Encounter '${definition.id}' boss health bar NPC type must belong to the encounter.`,
                );
            }
            for (const marker of bossHealthBar.markers ?? []) {
                if (
                    !Number.isFinite(marker.percent) ||
                    marker.percent <= 0 ||
                    marker.percent >= 100
                ) {
                    throw new Error(
                        `Encounter '${definition.id}' boss health bar marker percentage must be between 0 and 100 (exclusive).`,
                    );
                }
                if (marker.label !== undefined) {
                    const label = marker.label.trim();
                    if (!label || label.length > BOSS_HEALTH_BAR_MAX_MARKER_LABEL_LENGTH) {
                        throw new Error(
                            `Encounter '${definition.id}' boss health bar marker label must contain 1-${BOSS_HEALTH_BAR_MAX_MARKER_LABEL_LENGTH} characters.`,
                        );
                    }
                }
                if (
                    marker.style !== undefined &&
                    !BOSS_HEALTH_BAR_MARKER_STYLES.includes(marker.style)
                ) {
                    throw new Error(
                        `Encounter '${definition.id}' boss health bar marker style is invalid.`,
                    );
                }
            }
        }
        const killcount = definition.killcount;
        if (killcount) {
            if (!killcount.name.trim()) {
                throw new Error(`Encounter '${definition.id}' killcount name cannot be empty.`);
            }
            if (!Number.isInteger(killcount.collectionLogStructId) || killcount.collectionLogStructId < 0) {
                throw new Error(`Encounter '${definition.id}' killcount collection-log id is invalid.`);
            }
            if (killcount.milestoneInterval !== undefined &&
                (!Number.isInteger(killcount.milestoneInterval) || killcount.milestoneInterval <= 0)) {
                throw new Error(`Encounter '${definition.id}' killcount milestone interval is invalid.`);
            }
        }
        const attackIds = definition.attacks.map((attack) => attack.id);
        this.assertUnique(attackIds, `Attack id in '${definition.id}'`);
        for (const attack of definition.attacks) {
            if (!attack.id.trim()) throw new Error(`Encounter '${definition.id}' has an empty attack id.`);
            if (
                !Number.isInteger(attack.rangeTiles) ||
                attack.rangeTiles < 1 ||
                !Number.isInteger(attack.speedTicks) ||
                attack.speedTicks < 1
            ) {
                throw new Error(`Attack '${attack.id}' must have positive integer range and speed.`);
            }
            if (
                attack.maxHit !== undefined &&
                (!Number.isInteger(attack.maxHit) || attack.maxHit < 0)
            ) {
                throw new Error(`Attack '${attack.id}' max hit must be a non-negative integer.`);
            }
            if (
                attack.preferredDistance !== undefined &&
                (!Number.isInteger(attack.preferredDistance) ||
                    attack.preferredDistance < 1 ||
                    attack.preferredDistance > attack.rangeTiles)
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
            if (typeof attack.animation === "object") {
                const special = attack.animation.special;
                if (
                    (typeof special === "number" &&
                        (!Number.isInteger(special) || special < 0)) ||
                    (typeof special === "string" && !normalizeNpcSpecialName(special))
                ) {
                    throw new Error(
                        `Attack '${attack.id}' special animation reference is invalid.`,
                    );
                }
            }
            if (
                typeof attack.weight === "number" &&
                (!Number.isFinite(attack.weight) || attack.weight < 0)
            ) {
                throw new Error(`Attack '${attack.id}' weight must be a finite non-negative number.`);
            }
            if (
                attack.cooldownTicks !== undefined &&
                (!Number.isInteger(attack.cooldownTicks) || attack.cooldownTicks < 0)
            ) {
                throw new Error(`Attack '${attack.id}' cooldown must be a non-negative integer.`);
            }
            if (attack.priority !== undefined && !Number.isInteger(attack.priority)) {
                throw new Error(`Attack '${attack.id}' priority must be a finite integer.`);
            }
            if (
                (attack.minDistance !== undefined &&
                    (!Number.isInteger(attack.minDistance) || attack.minDistance < 0)) ||
                (attack.maxDistance !== undefined &&
                    (!Number.isInteger(attack.maxDistance) || attack.maxDistance < 0)) ||
                (attack.minDistance !== undefined &&
                    attack.maxDistance !== undefined &&
                    attack.minDistance > attack.maxDistance)
            ) {
                throw new Error(`Attack '${attack.id}' distance bounds are invalid.`);
            }
        }
        const phases = definition.phases ?? [];
        this.assertUnique(phases.map((phase) => phase.id), `Phase id in '${definition.id}'`);
        for (const phase of phases) {
            if (!phase.id.trim()) throw new Error(`Encounter '${definition.id}' has an empty phase id.`);
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
            if (!threshold.id.trim()) {
                throw new Error(`Encounter '${definition.id}' has an empty threshold id.`);
            }
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

export interface EncounterRegistrationOwner {
    registerCleanup(cleanup: () => void): unknown;
}

/**
 * Registers encounter data for exactly one script-provider lifetime. This is
 * the default for content modules so rollback, hot reload, and runtime reset
 * cannot retain stale boss definitions.
 */
export function registerOwnedEncounter(
    owner: EncounterRegistrationOwner,
    definition: EncounterDefinition,
): EncounterDefinition {
    const unregister = EncounterRegistry.shared.register(definition);
    try {
        owner.registerCleanup(unregister);
    } catch (error) {
        unregister();
        throw error;
    }
    return definition;
}
