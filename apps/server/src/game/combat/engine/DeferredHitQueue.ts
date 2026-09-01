import type { TickFrame } from "@server/network/wsServerTypes";
import { resolveTypedHitsplatStyle } from "@august/protocol/combat/TypedHitsplatStyles";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import type { AttackType } from "@server/game/combat/AttackType";
import type { EnchantedBoltEffect } from "@server/game/combat/AmmoSystem";
import { combatEffectApplicator } from "@server/game/combat/CombatEffectApplicator";
import { HITMARK_BLOCK, HITMARK_DAMAGE, HITMARK_POISON } from "@server/game/combat/HitEffects";
import { OSRS_HITSPLAT_DAMAGE_MAX_ME } from "@server/game/combat/OsrsHitsplatIds";
import type { CombatAttack } from "@server/game/combat/model/CombatAttack";
import { type CombatEntityRef, CombatEntityType } from "@server/game/combat/model/CombatEntityRef";
import { CombatAttributes } from "@server/game/combat/state/CombatAttributes";
import type { CombatEntity } from "@server/game/combat/engine/CombatTargetResolver";

export const DeferredHitsplatType = Object.freeze({
    Normal: "normal",
    Block: "block",
    Poison: "poison",
} as const);

export type DeferredHitsplatType = (typeof DeferredHitsplatType)[keyof typeof DeferredHitsplatType];

export interface PendingCombatHit {
    readonly id: number;
    readonly attack: CombatAttack;
    readonly source: CombatEntityRef;
    readonly target: CombatEntityRef;
    readonly damage: number;
    readonly maxHit: number;
    readonly landed: boolean;
    readonly hitsplatType: DeferredHitsplatType;
    readonly attackType: AttackType;
    readonly revealClock: number;
    readonly profileId: string;
    /** Keeps this hit's impact audio/effects while omitting the profile graphic. */
    readonly suppressProfileImpactGraphic?: boolean;
    /** Per-hit sound selected when the attack was queued. */
    readonly impactSoundIdOverride?: number;
    /** Enchanted bolt effect rolled when this projectile was fired. */
    readonly enchantedBoltEffect?: EnchantedBoltEffect;
}

export type PendingCombatHitInput = Omit<PendingCombatHit, "id">;

export interface AppliedCombatHit {
    readonly pending: PendingCombatHit;
    readonly source?: CombatEntity;
    readonly target: CombatEntity;
    readonly amount: number;
    readonly style: number;
    readonly hpCurrent: number;
    readonly hpMax: number;
    readonly appliedClock: number;
}

export interface DeferredHitQueueOptions {
    resolveEntity(reference: CombatEntityRef): CombatEntity | undefined;
    transformDamage?(
        pending: PendingCombatHit,
        target: CombatEntity,
        source: CombatEntity | undefined,
    ): number;
    /** Return true to keep a lethally-hit NPC alive at one hitpoint. */
    onNpcLethalHit?(event: {
        pending: PendingCombatHit;
        npc: NpcState;
        source: CombatEntity | undefined;
        proposedDamage: number;
        style: number;
        hitpointsBefore: number;
        appliedClock: number;
    }): boolean;
    onHitApplied?(hit: AppliedCombatHit, frame: TickFrame): void;
}

/** Absolute-map-clock scheduler for projectile and delayed melee hits. */
export class DeferredHitQueue {
    private readonly pendingHits: PendingCombatHit[] = [];
    private nextHitId = 1;

    constructor(private readonly options: DeferredHitQueueOptions) {}

    enqueue(input: PendingCombatHitInput): PendingCombatHit {
        const pending = Object.freeze({
            ...input,
            id: this.nextHitId++,
            damage: this.nonNegativeInteger(input.damage, "damage"),
            maxHit: this.nonNegativeInteger(input.maxHit, "max hit"),
            revealClock: this.mapClock(input.revealClock),
        });

        let low = 0;
        let high = this.pendingHits.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            const existing = this.pendingHits[middle];
            if (
                existing.revealClock < pending.revealClock ||
                (existing.revealClock === pending.revealClock && existing.id < pending.id)
            ) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        this.pendingHits.splice(low, 0, pending);
        return pending;
    }

    processTick(currentMapClock: number, frame: TickFrame): readonly AppliedCombatHit[] {
        const clock = this.mapClock(currentMapClock);
        let dueCount = 0;
        while (
            dueCount < this.pendingHits.length &&
            this.pendingHits[dueCount].revealClock <= clock
        ) {
            dueCount++;
        }
        if (dueCount === 0) return [];

        const due = this.pendingHits.splice(0, dueCount);
        const applied: AppliedCombatHit[] = [];
        for (const pending of due) {
            const target = this.options.resolveEntity(pending.target);
            if (!target || !this.isAlive(target, clock)) continue;

            const source = this.options.resolveEntity(pending.source);
            const requestedDamage =
                pending.hitsplatType === DeferredHitsplatType.Block
                    ? 0
                    : (this.options.transformDamage?.(pending, target, source) ?? pending.damage);
            let damage = this.nonNegativeInteger(requestedDamage, "transformed damage");
            // Encounter damage windows apply after accuracy has been resolved.
            // This mirrors the action-based combat path and keeps both combat
            // engines consistent for targets such as the Moons of Peril.
            if (target instanceof NpcState && source instanceof PlayerState) {
                if (target.forcePlayerMaxHit && pending.maxHit > 0) {
                    damage = pending.maxHit;
                }
                damage = Math.floor(
                    damage * Math.max(0, target.incomingPlayerDamageMultiplier),
                );
                if (target.incomingPlayerDamageCap !== undefined) {
                    damage = Math.min(damage, Math.max(0, Math.trunc(target.incomingPlayerDamageCap)));
                }
            }
            const style = this.resolveStyle(pending.hitsplatType);
            if (target instanceof NpcState) {
                const hitpointsBefore = target.getHitpoints();
                if (
                    hitpointsBefore > 0 &&
                    damage >= hitpointsBefore &&
                    this.options.onNpcLethalHit?.({
                        pending,
                        npc: target,
                        source,
                        proposedDamage: damage,
                        style,
                        hitpointsBefore,
                        appliedClock: clock,
                    }) === true
                ) {
                    damage = Math.max(0, hitpointsBefore - 1);
                }
            }
            const result =
                target instanceof PlayerState
                    ? combatEffectApplicator.applyPlayerHitsplat(
                          target,
                          style,
                          damage,
                          clock,
                          pending.maxHit,
                      )
                    : combatEffectApplicator.applyNpcHitsplat(
                          target,
                          style,
                          damage,
                          clock,
                          source instanceof PlayerState
                              ? Math.min(
                                    Math.floor(
                                        Math.max(0, pending.maxHit ?? 0) *
                                            Math.max(0, target.incomingPlayerDamageMultiplier),
                                    ),
                                    target.incomingPlayerDamageCap === undefined
                                        ? Number.POSITIVE_INFINITY
                                        : Math.max(0, Math.trunc(target.incomingPlayerDamageCap)),
                                )
                              : pending.maxHit,
                      );

            const hit: AppliedCombatHit = Object.freeze({
                pending,
                source,
                target,
                amount: result.amount,
                style: result.style,
                hpCurrent: result.hpCurrent,
                hpMax: result.hpMax,
                appliedClock: clock,
            });
            applied.push(hit);

            // Attack type is already resolved by the combat engine. Preserve all
            // gameplay styles, misses, and status splats; only successful normal
            // damage received by players gets a semantic presentation style.
            const displayStyle =
                target instanceof PlayerState &&
                result.amount > 0 &&
                pending.hitsplatType === DeferredHitsplatType.Normal
                    ? (resolveTypedHitsplatStyle(
                          pending.attackType,
                          result.style === OSRS_HITSPLAT_DAMAGE_MAX_ME,
                      ) ?? result.style)
                    : result.style;

            frame.hitsplats.push({
                targetType: target instanceof PlayerState ? "player" : "npc",
                targetId: target.id,
                damage: result.amount,
                style: displayStyle,
                sourceType: pending.source.type === CombatEntityType.Player ? "player" : "npc",
                sourcePlayerId:
                    pending.source.type === CombatEntityType.Player ? pending.source.id : undefined,
                hpCurrent: result.hpCurrent,
                hpMax: result.hpMax,
                tick: clock,
            });
            this.options.onHitApplied?.(hit, frame);
        }
        // Profile effects can schedule a same-cycle companion hitsplat (for
        // example Saradomin's Lightning after its successful melee strike).
        // Drain those immediately so both components retain one OSRS hit tick.
        const chained = this.processTick(clock, frame);
        return Object.freeze([...applied, ...chained]);
    }

    cancelTarget(target: CombatEntityRef): number {
        const before = this.pendingHits.length;
        for (let index = this.pendingHits.length - 1; index >= 0; index--) {
            const pendingTarget = this.pendingHits[index].target;
            if (pendingTarget.type === target.type && pendingTarget.id === target.id) {
                this.pendingHits.splice(index, 1);
            }
        }
        return before - this.pendingHits.length;
    }

    size(): number {
        return this.pendingHits.length;
    }

    snapshot(): readonly PendingCombatHit[] {
        return Object.freeze([...this.pendingHits]);
    }

    private isAlive(entity: CombatEntity, currentMapClock: number): boolean {
        if (entity.combatAttributes.get(CombatAttributes.IS_DEAD)) return false;
        if (entity instanceof PlayerState) {
            return entity.skillSystem.getHitpointsCurrent() > 0;
        }
        return entity.getHitpoints() > 0 && !entity.isDead(currentMapClock);
    }

    private resolveStyle(type: DeferredHitsplatType): number {
        switch (type) {
            case DeferredHitsplatType.Block:
                return HITMARK_BLOCK;
            case DeferredHitsplatType.Poison:
                return HITMARK_POISON;
            case DeferredHitsplatType.Normal:
            default:
                return HITMARK_DAMAGE;
        }
    }

    private mapClock(value: number): number {
        if (!Number.isFinite(value)) {
            throw new RangeError(`Deferred hit reveal clock must be finite; received ${value}`);
        }
        return Math.trunc(value);
    }

    private nonNegativeInteger(value: number, field: string): number {
        if (!Number.isFinite(value)) {
            throw new RangeError(`Deferred hit ${field} must be finite; received ${value}`);
        }
        return Math.max(0, Math.trunc(value));
    }
}
