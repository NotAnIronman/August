import type { PathService } from "../../../pathfinding/PathService";
import {
    CardinalAdjacentRouteStrategy,
    RectWithinRangeLineOfSightRouteStrategy,
    RectWithinRangeRouteStrategy,
    type RouteStrategy,
} from "../../../pathfinding/legacy/pathfinder/RouteStrategy";
import type { Actor } from "../../actor";
import { NpcState } from "../../npc";
import { PlayerState } from "../../player";
import { AttackType } from "../AttackType";
import type { CombatAttackTraits } from "../model/CombatAttack";
import type { CombatEntityRef } from "../model/CombatEntityRef";
import { CombatAttributes } from "../state/CombatAttributes";
import { resolvePreferredDistanceTiles } from "./CombatPreferredDistance";
import { type CombatRangeValidation, CombatRangeValidator } from "./CombatRangeValidator";
import {
    type CombatEntity,
    type CombatTargetInvalidReason,
    CombatTargetResolver,
} from "./CombatTargetResolver";

export type CombatAttackTraitsResolver = (
    attacker: CombatEntity,
    target: CombatEntity,
) => CombatAttackTraits | null;

export type CombatInteractionStatus = "ready" | "moving" | "unreachable" | "ended" | "unavailable";

export interface CombatInteractionResult {
    readonly status: CombatInteractionStatus;
    readonly target?: CombatEntity;
    readonly traits?: CombatAttackTraits;
    readonly range?: CombatRangeValidation;
    readonly reason?: CombatTargetInvalidReason | "missing_target" | "missing_traits";
}

interface CombatRouteState {
    readonly target: CombatEntityRef;
    readonly targetX: number;
    readonly targetY: number;
    readonly targetLevel: number;
    readonly rangeTiles: number;
    readonly attackType: string;
}

/** Runs target, facing, reach/LoS, and approach processing for one combatant. */
export class CombatInteractionProcessor {
    private readonly routes = new WeakMap<Actor, CombatRouteState>();

    constructor(
        private readonly targetResolver: CombatTargetResolver,
        private readonly rangeValidator: CombatRangeValidator,
        private readonly pathService: PathService,
    ) {}

    process(
        attacker: CombatEntity,
        currentMapClock: number,
        resolveTraits: CombatAttackTraitsResolver,
    ): CombatInteractionResult {
        const targetReference = attacker.combatAttributes.get(CombatAttributes.COMBAT_TARGET);
        if (!targetReference) {
            return { status: "ended", reason: "missing_target" };
        }

        // A stun prevents actions and movement, not the combat engagement
        // itself. Keeping the target lets an NPC resume pursuit/attacks when
        // Shove ends instead of silently de-aggroing.
        if (
            currentMapClock <
            attacker.combatAttributes.get(CombatAttributes.STUN_UNTIL_CLOCK)
        ) {
            attacker.clearPath();
            this.routes.delete(attacker);
            return { status: "unavailable" };
        }

        const attackerResolution = this.targetResolver.validateAttacker(attacker, currentMapClock);
        if (!attackerResolution.valid) {
            this.endInteraction(attacker);
            return { status: "ended", reason: attackerResolution.reason };
        }

        const targetResolution = this.targetResolver.resolve(targetReference, currentMapClock);
        if (!targetResolution.valid) {
            this.endInteraction(attacker);
            return { status: "ended", reason: targetResolution.reason };
        }
        const target = targetResolution.entity;
        const pairFailure = this.targetResolver.validatePair(attacker, target);
        if (pairFailure) {
            this.endInteraction(attacker);
            return { status: "ended", target, reason: pairFailure };
        }

        const resolvedTraits = resolveTraits(attacker, target);
        if (!resolvedTraits) {
            return { status: "unavailable", target, reason: "missing_traits" };
        }
        const traits = this.resolveInteractionTraits(
            attacker,
            targetReference,
            resolvedTraits,
        );

        attacker.setInteraction(target instanceof PlayerState ? "player" : "npc", target.id);

        // Range is evaluated before consulting the cached travel route. On the
        // movement tick that enters spell range, this falls straight through as
        // ready and the attack manager may cast without an extra idle tick.
        const range = this.rangeValidator.validate(attacker, target, traits);
        if (range.valid) {
            const preferredDistance = this.preferredApproachDistance(attacker, traits);
            const movementLocked =
                currentMapClock <
                Math.max(
                    attacker.combatAttributes.get(CombatAttributes.FREEZE_UNTIL_CLOCK),
                    attacker.combatAttributes.get(CombatAttributes.STUN_UNTIL_CLOCK),
                );
            if (
                preferredDistance !== undefined &&
                range.distanceTiles > preferredDistance &&
                !movementLocked
            ) {
                // Attack reach and movement intent are deliberately separate. A boss can
                // fire a ranged attack now while continuing to close to melee distance.
                this.routeToward(attacker, target, targetReference, {
                    ...traits,
                    rangeTiles: preferredDistance,
                });
            } else {
                attacker.clearPath();
                this.routes.delete(attacker);
            }
            return { status: "ready", target, traits, range };
        }

        if (
            currentMapClock <
            Math.max(
                attacker.combatAttributes.get(CombatAttributes.FREEZE_UNTIL_CLOCK),
                attacker.combatAttributes.get(CombatAttributes.STUN_UNTIL_CLOCK),
            )
        ) {
            attacker.clearPath();
            this.routes.delete(attacker);
            return { status: "unavailable", target, traits, range };
        }

        if (
            attacker instanceof PlayerState &&
            target instanceof NpcState &&
            this.routeReciprocalMeleeNpc(
                attacker,
                target,
                currentMapClock,
                range.overlapping,
                traits,
                resolveTraits,
            )
        ) {
            // Both actors choosing an approach tile during the same combat tick can
            // make them repeatedly step through one another. When they are mutually
            // engaged in one-tile melee, let the NPC close the distance and hold the
            // player's combat path. The same single-owner rule resolves a
            // size-one overlap instead of letting both actors escape through
            // one another and recreate the loop on the following tick. A player
            // embedded in a multi-tile NPC footprint remains an exception: both
            // actors must retain their established escape routes so the player is
            // not held underneath the larger footprint.
            attacker.clearPath();
            this.routes.delete(attacker);
            return { status: "moving", target, traits, range };
        }

        if (
            attacker instanceof NpcState &&
            target instanceof PlayerState &&
            this.yieldPlayerToReciprocalMeleeNpc(
                attacker,
                target,
                currentMapClock,
                range.overlapping,
                traits,
                resolveTraits,
            )
        ) {
            // Combat actors are processed independently, so the NPC may learn
            // about the reciprocal engagement after the player has already
            // planned a route this tick. Enforce the same single route owner
            // from this direction as well; otherwise both paths survive and
            // repeatedly walk through one another.
            const moving = this.routeToward(attacker, target, targetReference, traits);
            if (moving) {
                target.clearPath();
                this.routes.delete(target);
                return { status: "moving", target, traits, range };
            }
        }

        const moving = this.routeToward(attacker, target, targetReference, traits);
        return {
            status: moving ? "moving" : "unreachable",
            target,
            traits,
            range,
        };
    }

    endInteraction(attacker: CombatEntity): void {
        if (attacker instanceof PlayerState) {
            attacker.resetInteractions();
        } else {
            attacker.disengageCombat();
        }
        attacker.clearPath();
        this.routes.delete(attacker);
    }

    /**
     * Manual combat spells and autocasts share OSRS's ten-tile casting radius.
     * Resolve that intent here, before both range validation and route creation,
     * so a staff's melee reach can never make a distant spell click stall.
     */
    private resolveInteractionTraits(
        attacker: CombatEntity,
        targetReference: CombatEntityRef,
        traits: CombatAttackTraits,
    ): CombatAttackTraits {
        if (!(attacker instanceof PlayerState)) return traits;

        const pending = attacker.combat.pendingManualCombatSpell;
        const pendingSpellId =
            pending && this.pendingSpellTargets(pending.target, targetReference)
                ? pending.spellId
                : undefined;
        const autocastSpellId = attacker.combatAttributes.get(CombatAttributes.AUTOCAST_SPELL_ID);
        const activeSpellId =
            pendingSpellId ??
            (autocastSpellId !== null && autocastSpellId > 0
                ? autocastSpellId
                : traits.type === AttackType.Magic &&
                    traits.spellId !== undefined &&
                    traits.spellId > 0
                  ? traits.spellId
                  : undefined);
        if (activeSpellId === undefined) return traits;

        return {
            ...traits,
            type: AttackType.Magic,
            rangeTiles: 10,
            spellId: activeSpellId,
        };
    }

    private pendingSpellTargets(
        pendingTarget:
            | { type: "npc"; npcId: number }
            | { type: "player"; playerId: number },
        targetReference: CombatEntityRef,
    ): boolean {
        if (pendingTarget.type === "npc") {
            return targetReference.type === "npc" && targetReference.id === pendingTarget.npcId;
        }
        return targetReference.type === "player" && targetReference.id === pendingTarget.playerId;
    }

    private routeToward(
        attacker: CombatEntity,
        target: CombatEntity,
        targetReference: CombatEntityRef,
        traits: CombatAttackTraits,
    ): boolean {
        const rangeTiles = Math.max(1, Math.trunc(traits.rangeTiles));
        const existing = this.routes.get(attacker);
        const unchanged =
            existing != null &&
            existing.target.type === targetReference.type &&
            existing.target.id === targetReference.id &&
            existing.targetX === target.tileX &&
            existing.targetY === target.tileY &&
            existing.targetLevel === target.level &&
            existing.rangeTiles === rangeTiles &&
            existing.attackType === traits.type;

        if (unchanged && attacker.hasPath()) {
            return true;
        }

        const routed =
            attacker instanceof NpcState
                ? this.routeNpc(attacker, target, traits)
                : this.routePlayer(attacker, target, traits);

        if (!routed) {
            this.routes.delete(attacker);
            return false;
        }

        this.routes.set(attacker, {
            target: targetReference,
            targetX: target.tileX,
            targetY: target.tileY,
            targetLevel: target.level,
            rangeTiles,
            attackType: traits.type,
        });
        return true;
    }

    private routeReciprocalMeleeNpc(
        player: PlayerState,
        npc: NpcState,
        currentMapClock: number,
        overlapping: boolean,
        playerTraits: CombatAttackTraits,
        resolveTraits: CombatAttackTraitsResolver,
    ): boolean {
        if (playerTraits.type !== AttackType.Melee || playerTraits.rangeTiles > 1) return false;
        if (overlapping && npc.size > 1) return false;

        const npcTarget = npc.combatAttributes.get(CombatAttributes.COMBAT_TARGET);
        if (npcTarget?.type !== "player" || npcTarget.id !== player.id) return false;
        if (npc.isRecoveringToSpawn()) return false;
        if (
            currentMapClock <
            Math.max(
                npc.combatAttributes.get(CombatAttributes.FREEZE_UNTIL_CLOCK),
                npc.combatAttributes.get(CombatAttributes.STUN_UNTIL_CLOCK),
            )
        ) {
            return false;
        }

        const npcTraits = resolveTraits(npc, player);
        if (!npcTraits || npcTraits.type !== AttackType.Melee || npcTraits.rangeTiles > 1) {
            return false;
        }
        return this.routeToward(npc, player, npcTarget, npcTraits);
    }

    private yieldPlayerToReciprocalMeleeNpc(
        npc: NpcState,
        player: PlayerState,
        currentMapClock: number,
        overlapping: boolean,
        npcTraits: CombatAttackTraits,
        resolveTraits: CombatAttackTraitsResolver,
    ): boolean {
        if (npcTraits.type !== AttackType.Melee || npcTraits.rangeTiles > 1) return false;
        if (overlapping && npc.size > 1) return false;
        if (npc.isRecoveringToSpawn()) return false;
        if (
            currentMapClock <
            Math.max(
                npc.combatAttributes.get(CombatAttributes.FREEZE_UNTIL_CLOCK),
                npc.combatAttributes.get(CombatAttributes.STUN_UNTIL_CLOCK),
            )
        ) return false;
        const playerTarget = player.combatAttributes.get(CombatAttributes.COMBAT_TARGET);
        if (playerTarget?.type !== "npc" || playerTarget.id !== npc.id) return false;
        const playerTraits = resolveTraits(player, npc);
        return !!playerTraits && playerTraits.type === AttackType.Melee && playerTraits.rangeTiles <= 1;
    }

    private preferredApproachDistance(
        attacker: CombatEntity,
        traits: CombatAttackTraits,
    ): number | undefined {
        // Player movement remains click-driven. This setting is encounter/NPC intent.
        if (!(attacker instanceof NpcState)) return undefined;
        return resolvePreferredDistanceTiles(traits);
    }

    private routePlayer(
        attacker: PlayerState,
        target: CombatEntity,
        traits: CombatAttackTraits,
    ): boolean {
        const targetSize = Math.max(1, Math.trunc(target.size));
        const rangeTiles = Math.max(1, Math.trunc(traits.rangeTiles));
        let strategy: RouteStrategy;

        if (traits.type === AttackType.Melee && rangeTiles <= 1) {
            strategy = new CardinalAdjacentRouteStrategy(
                target.tileX,
                target.tileY,
                targetSize,
                targetSize,
            );
        } else if (traits.type === AttackType.Melee) {
            strategy = new RectWithinRangeRouteStrategy(
                target.tileX,
                target.tileY,
                targetSize,
                targetSize,
                rangeTiles,
            );
        } else {
            strategy = new RectWithinRangeLineOfSightRouteStrategy(
                target.tileX,
                target.tileY,
                targetSize,
                targetSize,
                rangeTiles,
            );
        }

        const result = this.pathService.findPathSteps(
            {
                from: { x: attacker.tileX, y: attacker.tileY, plane: attacker.level },
                to: { x: target.tileX, y: target.tileY },
                size: Math.max(1, attacker.size),
                worldViewId: attacker.worldViewId,
            },
            { routeStrategy: strategy, maxSteps: 128 },
        );
        if (!result.ok || !result.steps || result.steps.length === 0) {
            return false;
        }

        const end = result.end ?? result.steps[result.steps.length - 1];
        if (!strategy.hasArrived(end.x, end.y, attacker.level, attacker.size)) {
            return false;
        }

        attacker.setPath(result.steps, attacker.energy.isRunActive());
        return true;
    }

    private routeNpc(
        attacker: NpcState,
        target: CombatEntity,
        traits: CombatAttackTraits,
    ): boolean {
        if (attacker.isRecoveringToSpawn()) return false;

        const destination =
            traits.type === AttackType.Melee && traits.rangeTiles <= 1
                ? this.nearestCardinalApproachTile(attacker, target)
                : {
                      x: target.tileX + Math.floor(Math.max(1, target.size) / 2),
                      y: target.tileY + Math.floor(Math.max(1, target.size) / 2),
                  };
        const nextStep = this.pathService.findNpcPathStep(
            { x: attacker.tileX, y: attacker.tileY, plane: attacker.level },
            destination,
            Math.max(1, attacker.size),
        );
        if (!nextStep) return false;

        attacker.setPath([nextStep], false);
        return true;
    }

    private nearestCardinalApproachTile(attacker: Actor, target: Actor): { x: number; y: number } {
        const attackerSize = Math.max(1, attacker.size);
        const targetSize = Math.max(1, target.size);
        const candidates: Array<{ x: number; y: number }> = [];

        for (let y = target.tileY - attackerSize + 1; y < target.tileY + targetSize; y++) {
            candidates.push({ x: target.tileX - attackerSize, y });
            candidates.push({ x: target.tileX + targetSize, y });
        }
        for (let x = target.tileX - attackerSize + 1; x < target.tileX + targetSize; x++) {
            candidates.push({ x, y: target.tileY - attackerSize });
            candidates.push({ x, y: target.tileY + targetSize });
        }

        let nearest = candidates[0] ?? { x: target.tileX, y: target.tileY };
        let nearestDistance = Number.MAX_SAFE_INTEGER;
        for (const candidate of candidates) {
            const distance = Math.max(
                Math.abs(candidate.x - attacker.tileX),
                Math.abs(candidate.y - attacker.tileY),
            );
            if (distance < nearestDistance) {
                nearest = candidate;
                nearestDistance = distance;
            }
        }
        return nearest;
    }
}
