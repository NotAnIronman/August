import type { CombatAttackTraits } from "@server/game/combat/model/CombatAttack";
import { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import type {
    EncounterContext,
    EncounterDefinition,
    EncounterLifecycle,
    EncounterOwnedResources,
    EncounterThresholdEvent,
    PlannedEncounterAttack,
} from "@server/game/encounters/EncounterTypes";

export class EncounterRuntime {
    lifecycle: EncounterLifecycle = "idle";
    currentNpcRuntimeId: number;
    currentNpcTypeId: number;
    healthCurrent: number;
    readonly healthMax: number;

    private readonly random: EncounterRandom;
    private readonly animationRandom: EncounterRandom;
    private readonly cooldownUntil = new Map<string, number>();
    private readonly firedThresholds = new Set<string>();
    private readonly ownedNpcRuntimeIds = new Set<number>();
    private readonly ownedTaskIds = new Set<string>();
    private readonly ownedHazardIds = new Set<string>();
    private readonly ownedLocationIds = new Set<string>();
    private plannedAttack?: PlannedEncounterAttack;
    private previousAttackId?: string;

    constructor(
        readonly id: string,
        readonly definition: EncounterDefinition,
        npcRuntimeId: number,
        npcTypeId: number,
        actorMaxHealth: number,
        seed: number,
    ) {
        this.currentNpcRuntimeId = npcRuntimeId;
        this.currentNpcTypeId = npcTypeId;
        this.healthMax = Math.max(1, Math.trunc(definition.maxHealth ?? actorMaxHealth));
        this.healthCurrent = this.healthMax;
        this.random = new EncounterRandom(seed);
        // Keep animation variation on an independent deterministic stream so
        // adding a pool never changes which attacks the encounter selects.
        this.animationRandom = new EncounterRandom(seed ^ 0x51f15e5d);
        this.ownedNpcRuntimeIds.add(npcRuntimeId);
    }

    get phaseId(): string {
        const phases = [...(this.definition.phases ?? [])].sort(
            (first, second) => first.startsAtHealthPercent - second.startsAtHealthPercent,
        );
        const current = phases.find(
            (phase) => this.healthPercent <= phase.startsAtHealthPercent,
        );
        return current?.id ?? "default";
    }

    get healthPercent(): number {
        return (this.healthCurrent / this.healthMax) * 100;
    }

    planAttack(input: {
        tick: number;
        targetId: number;
        targetDistance: number;
        targetProtectingFromMelee?: boolean;
        targetIsAttackingNpc?: boolean;
    }): PlannedEncounterAttack | undefined {
        if (this.lifecycle === "dead" || this.lifecycle === "disposed") return undefined;
        if (this.plannedAttack?.targetId === input.targetId) {
            // Keep an attack reserved while the NPC closes to its preferred
            // distance, but do not let a now-impossible short-range attack pin
            // the NPC in pursuit forever. Hybrid bosses must be allowed to
            // re-plan as soon as their target leaves that attack's max range.
            const maximumDistance =
                this.plannedAttack.definition.maxDistance ?? Number.POSITIVE_INFINITY;
            if (input.targetDistance <= maximumDistance) return this.plannedAttack;
        }
        this.plannedAttack = undefined;

        const context = this.createContext(input);
        const phase = this.definition.phases?.find((entry) => entry.id === this.phaseId);
        const allowedIds = phase?.attackIds ? new Set(phase.attackIds) : undefined;
        const candidates = this.definition.attacks.filter((attack) => {
            if (allowedIds && !allowedIds.has(attack.id)) return false;
            if (input.tick < (this.cooldownUntil.get(attack.id) ?? 0)) return false;
            if (input.targetDistance < (attack.minDistance ?? 0)) return false;
            if (input.targetDistance > (attack.maxDistance ?? Number.POSITIVE_INFINITY)) {
                return false;
            }
            return attack.condition?.(context) ?? true;
        });
        if (candidates.length === 0) return undefined;

        const highestPriority = Math.max(...candidates.map((attack) => attack.priority ?? 0));
        const prioritized = candidates.filter(
            (attack) => (attack.priority ?? 0) === highestPriority,
        );
        const selected = prioritized[
            this.random.weightedIndex(
                prioritized.map((attack) => {
                    const weight = typeof attack.weight === "function" ? attack.weight(context) : attack.weight;
                    return Math.max(0, Number.isFinite(weight) ? (weight ?? 1) : 0);
                }),
            )
        ];
        if (!selected) return undefined;
        const traits: CombatAttackTraits = Object.freeze({
            type: selected.type,
            style: selected.style ?? null,
            rangeTiles: Math.max(1, Math.trunc(selected.rangeTiles)),
            preferredDistanceTiles:
                selected.preferredDistance === undefined
                    ? undefined
                    : Math.max(1, Math.trunc(selected.preferredDistance)),
            speedTicks: Math.max(1, Math.trunc(selected.speedTicks)),
            maxHitOverride:
                selected.maxHit === undefined
                    ? undefined
                    : Math.max(0, Math.trunc(selected.maxHit)),
            specialAttack: selected.special,
            effects: selected.effects,
        });
        this.lifecycle = "engaged";
        this.plannedAttack = Object.freeze({
            definition: selected,
            targetId: input.targetId,
            plannedAtTick: Math.trunc(input.tick),
            animationSelector:
                Math.floor(this.animationRandom.next() * 0x1_0000_0000) >>> 0,
            traits,
        });
        return this.plannedAttack;
    }

    consumePlannedAttack(targetId: number, tick: number): PlannedEncounterAttack | undefined {
        const planned = this.plannedAttack;
        if (!planned || planned.targetId !== targetId) return undefined;
        this.plannedAttack = undefined;
        this.previousAttackId = planned.definition.id;
        const cooldown = Math.max(0, Math.trunc(planned.definition.cooldownTicks ?? 0));
        if (cooldown > 0) this.cooldownUntil.set(planned.definition.id, Math.trunc(tick) + cooldown);
        return planned;
    }

    applyDamage(amount: number): readonly EncounterThresholdEvent[] {
        if (this.lifecycle === "dead" || this.lifecycle === "disposed") return [];
        const previousHealth = this.healthCurrent;
        this.healthCurrent = Math.max(0, previousHealth - Math.max(0, Math.trunc(amount)));
        if (this.healthCurrent === 0) this.lifecycle = "dead";
        return this.collectCrossedThresholds(previousHealth, this.healthCurrent);
    }

    heal(amount: number): void {
        if (this.lifecycle === "disposed") return;
        this.healthCurrent = Math.min(
            this.healthMax,
            this.healthCurrent + Math.max(0, Math.trunc(amount)),
        );
        // NpcState is authoritative. A pre-despawn heal can legitimately
        // restore a zero-HP actor (notably a script-intercepted lethal status
        // hit), so the encounter must not remain permanently non-plannable.
        if (this.lifecycle === "dead" && this.healthCurrent > 0) {
            this.lifecycle = "idle";
        }
    }

    /**
     * Start a fresh life for the same NPC object (for example a leash/stuck
     * reset). Normal healing deliberately does not re-arm thresholds, while a
     * true reset clears every per-life combat decision and threshold.
     */
    resetHealth(): void {
        if (this.lifecycle === "disposed") return;
        this.lifecycle = "resetting";
        this.healthCurrent = this.healthMax;
        this.cooldownUntil.clear();
        this.firedThresholds.clear();
        this.plannedAttack = undefined;
        this.previousAttackId = undefined;
        this.lifecycle = "idle";
    }

    transitionForm(npcRuntimeId: number, npcTypeId: number): void {
        if (!this.definition.npcTypeIds.includes(npcTypeId)) {
            throw new Error(`NPC type ${npcTypeId} is not a form of encounter '${this.definition.id}'.`);
        }
        this.lifecycle = "transitioning";
        this.ownedNpcRuntimeIds.delete(this.currentNpcRuntimeId);
        this.currentNpcRuntimeId = Math.trunc(npcRuntimeId);
        this.currentNpcTypeId = Math.trunc(npcTypeId);
        this.ownedNpcRuntimeIds.add(this.currentNpcRuntimeId);
        this.plannedAttack = undefined;
        this.lifecycle = this.healthCurrent <= 0 ? "dead" : "engaged";
    }

    ownNpc(npcRuntimeId: number): void {
        this.ownedNpcRuntimeIds.add(Math.trunc(npcRuntimeId));
    }
    ownTask(taskId: string): void {
        this.ownedTaskIds.add(taskId);
    }
    ownHazard(hazardId: string): void {
        this.ownedHazardIds.add(hazardId);
    }
    ownLocation(locationId: string): void {
        this.ownedLocationIds.add(locationId);
    }

    snapshotOwnedResources(): EncounterOwnedResources {
        return {
            npcRuntimeIds: new Set(this.ownedNpcRuntimeIds),
            taskIds: new Set(this.ownedTaskIds),
            hazardIds: new Set(this.ownedHazardIds),
            locationIds: new Set(this.ownedLocationIds),
        };
    }

    dispose(): EncounterOwnedResources {
        const resources = this.snapshotOwnedResources();
        this.lifecycle = "disposed";
        this.plannedAttack = undefined;
        this.ownedNpcRuntimeIds.clear();
        this.ownedTaskIds.clear();
        this.ownedHazardIds.clear();
        this.ownedLocationIds.clear();
        return resources;
    }

    private createContext(input: {
        tick: number;
        targetId: number;
        targetDistance: number;
        targetProtectingFromMelee?: boolean;
        targetIsAttackingNpc?: boolean;
    }): EncounterContext {
        return {
            tick: Math.trunc(input.tick),
            encounterId: this.id,
            npcRuntimeId: this.currentNpcRuntimeId,
            npcTypeId: this.currentNpcTypeId,
            targetId: Math.trunc(input.targetId),
            targetDistance: Math.max(0, input.targetDistance),
            healthCurrent: this.healthCurrent,
            healthMax: this.healthMax,
            healthPercent: this.healthPercent,
            phaseId: this.phaseId,
            previousAttackId: this.previousAttackId,
            targetProtectingFromMelee: input.targetProtectingFromMelee === true,
            targetIsAttackingNpc: input.targetIsAttackingNpc === true,
        };
    }

    private collectCrossedThresholds(
        previousHealth: number,
        currentHealth: number,
    ): EncounterThresholdEvent[] {
        const previousPercent = (previousHealth / this.healthMax) * 100;
        const currentPercent = (currentHealth / this.healthMax) * 100;
        const events: EncounterThresholdEvent[] = [];
        for (const threshold of this.definition.thresholds ?? []) {
            if (this.firedThresholds.has(threshold.id)) continue;
            if (previousPercent > threshold.atHealthPercent && currentPercent <= threshold.atHealthPercent) {
                this.firedThresholds.add(threshold.id);
                events.push({
                    encounterId: this.id,
                    thresholdId: threshold.id,
                    previousHealth,
                    currentHealth,
                    atHealthPercent: threshold.atHealthPercent,
                });
            }
        }
        return events.sort((first, second) => second.atHealthPercent - first.atHealthPercent);
    }
}
