import type { CombatAttackTraits } from "@server/game/combat/model/CombatAttack";
import { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import type { MechanicHandle } from "@server/game/encounters/mechanics/MechanicHandle";
import { logger } from "@server/observability/logger";
import type {
    EncounterAttackDefinition,
    EncounterContext,
    EncounterDefinition,
    EncounterLifecycle,
    EncounterOwnedResources,
    EncounterPhaseDefinition,
    EncounterThresholdEvent,
    PlannedEncounterAttack,
} from "@server/game/encounters/EncounterTypes";

export type MechanicReentrancyPolicy = "replace" | "ignore" | "stack";

export class EncounterRuntime {
    lifecycle: EncounterLifecycle = "idle";
    currentNpcRuntimeId: number;
    currentNpcTypeId: number;
    healthCurrent: number;
    readonly healthMax: number;

    readonly rng: EncounterRandom;
    private readonly animationRandom: EncounterRandom;
    private readonly cooldownUntil = new Map<string, number>();
    private readonly firedThresholds = new Set<string>();
    private readonly ownedNpcRuntimeIds = new Set<number>();
    private readonly ownedTaskIds = new Set<string | number>();
    private readonly ownedHazardIds = new Set<string>();
    private readonly ownedLocationIds = new Set<string>();
    private plannedAttack?: PlannedEncounterAttack;
    private previousAttackId?: string;
    private readonly activeMechanics = new Set<MechanicHandle>();
    private readonly mechanicsByBinding = new Map<string, Set<MechanicHandle>>();
    private readonly mechanicEventCounts = new Map<string, number>();
    private readonly phasesByHealth: readonly EncounterPhaseDefinition[];
    private mechanicSerial = 0;
    private resetGeneration = 0;

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
        this.phasesByHealth = [...(definition.phases ?? [])].sort(
            (first, second) => first.startsAtHealthPercent - second.startsAtHealthPercent,
        );
        this.rng = new EncounterRandom(seed);
        // Keep animation variation on an independent deterministic stream so
        // adding a pool never changes which attacks the encounter selects.
        this.animationRandom = new EncounterRandom(seed ^ 0x51f15e5d);
        this.ownedNpcRuntimeIds.add(npcRuntimeId);
    }

    get phaseId(): string {
        const healthPercent = this.healthPercent;
        const current = this.phasesByHealth.find(
            (phase) => healthPercent <= phase.startsAtHealthPercent,
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
        const phaseId = this.phaseId;
        const context = this.createContext(input, phaseId);
        const phase = this.definition.phases?.find((entry) => entry.id === phaseId);
        const allowedIds = phase?.attackIds ? new Set(phase.attackIds) : undefined;
        const isEligible = (attack: EncounterAttackDefinition): boolean => {
            if (allowedIds && !allowedIds.has(attack.id)) return false;
            if (input.tick < (this.cooldownUntil.get(attack.id) ?? 0)) return false;
            if (input.targetDistance < (attack.minDistance ?? 0)) return false;
            if (input.targetDistance > (attack.maxDistance ?? Number.POSITIVE_INFINITY)) {
                return false;
            }
            return attack.condition?.(context) ?? true;
        };
        if (this.plannedAttack?.targetId === input.targetId) {
            // Keep an attack reserved while the NPC closes to its preferred
            // distance only while it remains legal in the current phase and
            // context. This is important for conditional pursuit attacks such
            // as Kree'arra's melee attempt, which must stop once its condition
            // changes before the old reservation is consumed.
            if (isEligible(this.plannedAttack.definition)) return this.plannedAttack;
        }
        this.plannedAttack = undefined;

        const candidates = this.definition.attacks.filter(isEligible);
        if (candidates.length === 0) return undefined;

        const highestPriority = Math.max(...candidates.map((attack) => attack.priority ?? 0));
        const prioritized = candidates.filter(
            (attack) => (attack.priority ?? 0) === highestPriority,
        );
        const selected = prioritized[
            this.rng.weightedIndex(
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
    resetHealth(): EncounterOwnedResources {
        if (this.lifecycle === "disposed") return this.emptyOwnedResources();
        this.lifecycle = "resetting";
        this.resetGeneration += 1;
        this.cancelMechanics();
        const resources = this.snapshotOwnedResources();
        this.clearOwnedResources();
        // The actor being reset remains the encounter's primary NPC. Every
        // other owned NPC belongs to the life which just ended.
        this.ownedNpcRuntimeIds.add(this.currentNpcRuntimeId);
        this.healthCurrent = this.healthMax;
        this.cooldownUntil.clear();
        this.firedThresholds.clear();
        this.mechanicEventCounts.clear();
        this.plannedAttack = undefined;
        this.previousAttackId = undefined;
        this.lifecycle = "idle";
        return resources;
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
        // Forms have independent attack rotations; the old form's cadence
        // must not leak into the replacement's first attack.
        this.mechanicEventCounts.clear();
        this.plannedAttack = undefined;
        this.lifecycle = this.healthCurrent <= 0 ? "dead" : "engaged";
    }

    ownNpc(npcRuntimeId: number): void {
        this.ownedNpcRuntimeIds.add(Math.trunc(npcRuntimeId));
    }
    ownTask(taskId: string | number): void {
        this.ownedTaskIds.add(taskId);
    }
    ownHazard(hazardId: string): void {
        this.ownedHazardIds.add(hazardId);
    }
    ownLocation(locationId: string): void {
        this.ownedLocationIds.add(locationId);
    }

    releaseNpc(npcRuntimeId: number): void {
        this.ownedNpcRuntimeIds.delete(Math.trunc(npcRuntimeId));
    }

    releaseTask(taskId: string | number): void {
        this.ownedTaskIds.delete(taskId);
    }

    releaseHazard(hazardId: string): void {
        this.ownedHazardIds.delete(hazardId);
    }

    releaseLocation(locationId: string): void {
        this.ownedLocationIds.delete(locationId);
    }

    /** Monotonically changes whenever a same-actor encounter life is reset. */
    get generation(): number {
        return this.resetGeneration;
    }

    ownMechanic(handle: MechanicHandle): void {
        this.activeMechanics.add(handle);
    }

    releaseMechanic(handle: MechanicHandle): void {
        this.activeMechanics.delete(handle);
        for (const [bindingId, handles] of this.mechanicsByBinding) {
            handles.delete(handle);
            if (handles.size === 0) this.mechanicsByBinding.delete(bindingId);
        }
    }

    /**
     * Starts a named mechanic binding with explicit re-entrancy behavior.
     * Mechanics themselves remain independent factories; this is the small
     * policy layer content uses when a trigger can fire again while active.
     */
    runMechanic(
        bindingId: string,
        policy: MechanicReentrancyPolicy,
        create: () => MechanicHandle,
    ): MechanicHandle | undefined {
        if (
            this.lifecycle === "dead" ||
            this.lifecycle === "disposed" ||
            this.lifecycle === "resetting"
        ) {
            return undefined;
        }
        const key = bindingId.trim();
        if (!key) throw new Error("Encounter mechanic binding id cannot be empty.");
        const existing = [...(this.mechanicsByBinding.get(key) ?? [])].filter(
            (handle) => handle.isActive,
        );
        if (policy === "ignore" && existing.length > 0) return existing[0];
        if (policy === "replace") {
            for (const handle of existing) handle.cancel();
        }
        let handle: MechanicHandle;
        try {
            handle = create();
        } catch (error) {
            logger.warn(`[encounter] mechanic binding '${key}' failed for ${this.id}`, error);
            return undefined;
        }
        if (!handle.isActive) return handle;
        // A mechanic launched through this policy boundary is encounter-owned
        // even when its factory is a small content-specific implementation
        // rather than one of the shared factories. Shared factories already
        // call ownMechanic themselves; Set membership makes that registration
        // safely idempotent. Without this ownership, resetHealth()/dispose()
        // could leave a content mechanic running after its boss reset.
        this.ownMechanic(handle);
        let handles = this.mechanicsByBinding.get(key);
        if (!handles) {
            handles = new Set();
            this.mechanicsByBinding.set(key, handles);
        }
        handles.add(handle);
        return handle;
    }

    nextMechanicSerial(): number {
        this.mechanicSerial += 1;
        return this.mechanicSerial;
    }

    /**
     * Advances one declarative mechanic cadence for this encounter life.
     * Returns the one-based event count, or undefined once the encounter can
     * no longer start mechanics. Counts are cleared by health resets and form
     * transitions, and are never shared between spawned runtimes.
     */
    advanceMechanicEvent(bindingId: string): number | undefined {
        if (
            this.lifecycle === "dead" ||
            this.lifecycle === "disposed" ||
            this.lifecycle === "resetting"
        ) {
            return undefined;
        }
        const key = bindingId.trim();
        if (!key) throw new Error("Encounter mechanic event id cannot be empty.");
        const count = (this.mechanicEventCounts.get(key) ?? 0) + 1;
        this.mechanicEventCounts.set(key, count);
        return count;
    }

    resetMechanicEvent(bindingId: string): void {
        const key = bindingId.trim();
        if (!key) throw new Error("Encounter mechanic event id cannot be empty.");
        this.mechanicEventCounts.delete(key);
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
        this.resetGeneration += 1;
        this.cancelMechanics();
        this.mechanicEventCounts.clear();
        this.plannedAttack = undefined;
        this.clearOwnedResources();
        return resources;
    }

    private clearOwnedResources(): void {
        this.ownedNpcRuntimeIds.clear();
        this.ownedTaskIds.clear();
        this.ownedHazardIds.clear();
        this.ownedLocationIds.clear();
    }

    private emptyOwnedResources(): EncounterOwnedResources {
        return {
            npcRuntimeIds: new Set(),
            taskIds: new Set(),
            hazardIds: new Set(),
            locationIds: new Set(),
        };
    }

    private cancelMechanics(): void {
        for (const mechanic of [...this.activeMechanics]) {
            try {
                mechanic.cancel();
            } catch {
                // Individual mechanics must not be able to block lifecycle cleanup.
            }
        }
        this.activeMechanics.clear();
        this.mechanicsByBinding.clear();
    }

    private createContext(input: {
        tick: number;
        targetId: number;
        targetDistance: number;
        targetProtectingFromMelee?: boolean;
        targetIsAttackingNpc?: boolean;
    }, phaseId: string): EncounterContext {
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
            phaseId,
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
