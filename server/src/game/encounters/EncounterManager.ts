import type { NpcState } from "../npc";
import type { PlayerState } from "../player";
import type { CombatAttack, CombatAttackTraits } from "../combat/model/CombatAttack";
import { EncounterRegistry } from "./EncounterRegistry";
import { EncounterRuntime } from "./EncounterRuntime";
import type { EncounterAnimationReference, PlannedEncounterAttack } from "./EncounterTypes";

export interface EncounterCleanupAdapter {
    removeNpc?(npcRuntimeId: number): void;
    cancelTask?(taskId: string): void;
    removeHazard?(hazardId: string): void;
    removeLocation?(locationId: string): void;
}

export type EncounterAnimationResolver = (
    npcTypeId: number,
    animation: EncounterAnimationReference,
) => number | undefined;

export class EncounterManager {
    private readonly byNpcRuntimeId = new Map<number, EncounterRuntime>();
    private readonly byId = new Map<string, EncounterRuntime>();
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
                ? this.resolveAnimation?.(npc.typeId, planned.definition.animation)
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
        return runtime;
    }

    getById(id: string): EncounterRuntime | undefined {
        return this.byId.get(id);
    }

    getByNpcRuntimeId(npcRuntimeId: number): EncounterRuntime | undefined {
        return this.byNpcRuntimeId.get(Math.trunc(npcRuntimeId));
    }

    transitionForm(runtime: EncounterRuntime, npc: NpcState): void {
        const automaticallyCreated = this.byNpcRuntimeId.get(npc.id);
        if (automaticallyCreated && automaticallyCreated !== runtime) {
            this.byId.delete(automaticallyCreated.id);
            automaticallyCreated.dispose();
        }
        this.byNpcRuntimeId.delete(runtime.currentNpcRuntimeId);
        runtime.transitionForm(npc.id, npc.typeId);
        this.byNpcRuntimeId.set(npc.id, runtime);
    }

    removeNpc(npcRuntimeId: number): void {
        const runtime = this.byNpcRuntimeId.get(Math.trunc(npcRuntimeId));
        if (!runtime) return;
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
}
