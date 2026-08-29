import type { NpcHealthChange, NpcState } from "../npc";
import type { PlayerState } from "../player";
import { logger } from "../../utils/logger";
import type { CombatAttack, CombatAttackTraits } from "../combat/model/CombatAttack";
import { EncounterRegistry } from "./EncounterRegistry";
import { EncounterRuntime } from "./EncounterRuntime";
import type {
    EncounterAnimationReference,
    EncounterThresholdEvent,
    PlannedEncounterAttack,
} from "./EncounterTypes";

export interface EncounterCleanupAdapter {
    removeNpc?(npcRuntimeId: number): void;
    cancelTask?(taskId: string): void;
    removeHazard?(hazardId: string): void;
    removeLocation?(locationId: string): void;
}

export type EncounterAnimationResolver = (
    npcTypeId: number,
    animation: EncounterAnimationReference,
    selector: number,
) => number | undefined;

export type EncounterThresholdListener = (event: EncounterThresholdEvent) => void;

export class EncounterManager {
    private readonly byNpcRuntimeId = new Map<number, EncounterRuntime>();
    private readonly byId = new Map<string, EncounterRuntime>();
    private readonly healthSubscriptions = new Map<number, () => void>();
    private readonly thresholdListeners = new Set<EncounterThresholdListener>();
    private serial = 0;
    private currentTick = 0;

    constructor(
        private readonly registry: EncounterRegistry = EncounterRegistry.shared,
        private readonly cleanup: EncounterCleanupAdapter = {},
        private readonly resolveAnimation?: EncounterAnimationResolver,
    ) {}

    setCurrentTick(tick: number): void {
        this.currentTick = Math.trunc(tick);
    }

    resolveAttackTraits(npc: NpcState, target: PlayerState): CombatAttackTraits | undefined {
        const runtime = this.ensureForNpc(npc);
        if (!runtime) return undefined;
        const npcMaxX = npc.tileX + Math.max(1, npc.size) - 1;
        const npcMaxY = npc.tileY + Math.max(1, npc.size) - 1;
        const targetMaxX = target.tileX + Math.max(1, target.size) - 1;
        const targetMaxY = target.tileY + Math.max(1, target.size) - 1;
        const distanceX = Math.max(0, target.tileX - npcMaxX, npc.tileX - targetMaxX);
        const distanceY = Math.max(0, target.tileY - npcMaxY, npc.tileY - targetMaxY);
        const distance = Math.max(distanceX, distanceY);
        const planned = runtime.planAttack({
            tick: this.currentTick,
            targetId: target.id,
            targetDistance: distance,
        });
        if (!planned) return undefined;
        const animationId =
            planned.definition.animationId ??
            (planned.definition.animation
                ? this.resolveAnimation?.(
                      npc.typeId,
                      planned.definition.animation,
                      planned.animationSelector,
                  )
                : undefined);
        if (planned.definition.animation !== undefined) {
            return Object.freeze({
                ...planned.traits,
                animationId:
                    animationId !== undefined && animationId > 0
                        ? Math.trunc(animationId)
                        : undefined,
                suppressDefaultNpcAnimation: true,
            });
        }
        return animationId !== undefined && animationId > 0
            ? Object.freeze({ ...planned.traits, animationId: Math.trunc(animationId) })
            : planned.traits;
    }

    onAttackPrepared(attack: CombatAttack): PlannedEncounterAttack | undefined {
        if (attack.attacker.type !== "npc") return undefined;
        return this.byNpcRuntimeId
            .get(attack.attacker.id)
            ?.consumePlannedAttack(attack.target.id, attack.attackClock);
    }

    ensureForNpc(npc: NpcState): EncounterRuntime | undefined {
        const existing = this.byNpcRuntimeId.get(npc.id);
        if (existing) return existing;
        const definition = this.registry.findByNpcTypeId(npc.typeId);
        if (!definition) return undefined;
        const serial = ++this.serial;
        const id = `${definition.id}:${serial}`;
        const runtime = new EncounterRuntime(
            id,
            definition,
            npc.id,
            npc.typeId,
            npc.getMaxHitpoints(),
            this.seed(definition.id, serial, npc.id),
        );
        this.byNpcRuntimeId.set(npc.id, runtime);
        this.byId.set(id, runtime);
        this.observeHealth(npc, runtime);
        return runtime;
    }

    getById(id: string): EncounterRuntime | undefined {
        return this.byId.get(id);
    }

    getByNpcRuntimeId(npcRuntimeId: number): EncounterRuntime | undefined {
        return this.byNpcRuntimeId.get(Math.trunc(npcRuntimeId));
    }

    onThresholdCrossed(listener: EncounterThresholdListener): () => void {
        this.thresholdListeners.add(listener);
        return () => this.thresholdListeners.delete(listener);
    }

    transitionFormIfCompatible(previousNpcRuntimeId: number, replacement: NpcState): boolean {
        const runtime = this.getByNpcRuntimeId(previousNpcRuntimeId);
        if (!runtime || !runtime.definition.npcTypeIds.includes(replacement.typeId)) {
            return false;
        }
        this.transitionForm(runtime, replacement, () => {
            // Script-created replacements spawn at full cache/encounter HP and
            // briefly receive their own automatic runtime. Both encounter
            // subscriptions are detached before this alignment, preventing a
            // preserved-damage write from firing duplicate threshold mechanics.
            const desired = Math.max(
                0,
                Math.min(replacement.getMaxHitpoints(), runtime.healthCurrent),
            );
            const current = replacement.getHitpoints();
            if (current > desired) replacement.applyDamage(current - desired);
            else if (current < desired) replacement.heal(desired - current);
        });
        return true;
    }

    transitionForm(
        runtime: EncounterRuntime,
        npc: NpcState,
        alignReplacement?: () => void,
    ): void {
        const automaticallyCreated = this.byNpcRuntimeId.get(npc.id);
        if (automaticallyCreated && automaticallyCreated !== runtime) {
            this.stopObservingHealth(npc.id);
            this.byId.delete(automaticallyCreated.id);
            automaticallyCreated.dispose();
        }
        this.stopObservingHealth(runtime.currentNpcRuntimeId);
        this.byNpcRuntimeId.delete(runtime.currentNpcRuntimeId);
        runtime.transitionForm(npc.id, npc.typeId);
        this.byNpcRuntimeId.set(npc.id, runtime);
        alignReplacement?.();
        // A form transition intentionally preserves the shared health pool.
        // The replacement is already authored with that HP, so initial
        // alignment here would subtract the preserved damage a second time.
        this.observeHealth(npc, runtime, false);
    }

    removeNpc(npcRuntimeId: number): void {
        const runtime = this.byNpcRuntimeId.get(Math.trunc(npcRuntimeId));
        if (!runtime) return;
        this.stopObservingHealth(runtime.currentNpcRuntimeId);
        this.byNpcRuntimeId.delete(runtime.currentNpcRuntimeId);
        this.byId.delete(runtime.id);
        const resources = runtime.dispose();
        for (const ownedNpcId of resources.npcRuntimeIds) {
            if (ownedNpcId !== npcRuntimeId) this.cleanup.removeNpc?.(ownedNpcId);
        }
        for (const taskId of resources.taskIds) this.cleanup.cancelTask?.(taskId);
        for (const hazardId of resources.hazardIds) this.cleanup.removeHazard?.(hazardId);
        for (const locationId of resources.locationIds) this.cleanup.removeLocation?.(locationId);
    }

    private seed(definitionId: string, serial: number, npcRuntimeId: number): number {
        let hash = 2166136261;
        for (const char of definitionId) {
            hash ^= char.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return (hash ^ Math.imul(serial, 31) ^ Math.imul(npcRuntimeId, 131)) >>> 0;
    }

    private observeHealth(
        npc: NpcState,
        runtime: EncounterRuntime,
        alignInitialHealth: boolean = true,
    ): void {
        this.stopObservingHealth(npc.id);

        // Some narrow unit-test doubles predate the observer surface. Real
        // NpcState instances always expose it, while this guard keeps the
        // encounter planner independently testable with structural doubles.
        const subscribe = npc.onHealthChange;
        if (typeof subscribe !== "function") return;

        if (alignInitialHealth) {
            const actualMax = npc.getMaxHitpoints();
            const actualCurrent = npc.getHitpoints();
            if (actualCurrent <= 0) {
                this.applyRuntimeDamage(runtime, runtime.healthCurrent);
            } else if (actualCurrent < actualMax) {
                this.applyRuntimeDamage(runtime, actualMax - actualCurrent);
            }
        }

        const unsubscribe = subscribe.call(npc, (change) => {
            if (this.byNpcRuntimeId.get(npc.id) !== runtime) return;
            this.synchronizeHealth(runtime, change);
        });
        this.healthSubscriptions.set(npc.id, unsubscribe);
    }

    private stopObservingHealth(npcRuntimeId: number): void {
        const normalized = Math.trunc(npcRuntimeId);
        this.healthSubscriptions.get(normalized)?.();
        this.healthSubscriptions.delete(normalized);
    }

    private synchronizeHealth(runtime: EncounterRuntime, change: NpcHealthChange): void {
        if (change.reason === "reset") {
            runtime.resetHealth();
            return;
        }

        const delta = change.current - change.previous;
        if (delta < 0) {
            // A zero-HP commit is authoritative even if an invalid definition
            // declared a different max health from the actor. Apply it once,
            // using the actual post-clamp result as the death decision.
            this.applyRuntimeDamage(
                runtime,
                change.current <= 0 ? runtime.healthCurrent : Math.abs(delta),
            );
            return;
        }
        if (delta > 0) runtime.heal(delta);
    }

    private applyRuntimeDamage(runtime: EncounterRuntime, amount: number): void {
        const events = runtime.applyDamage(amount);
        if (events.length === 0 || this.thresholdListeners.size === 0) return;
        for (const event of events) {
            for (const listener of this.thresholdListeners) {
                try {
                    listener(event);
                } catch (err) {
                    logger.warn(
                        `[encounter] threshold listener failed (${event.encounterId}:${event.thresholdId})`,
                        err,
                    );
                }
            }
        }
    }
}
