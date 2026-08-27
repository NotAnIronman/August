import type { AttackType } from "../combat/AttackType";
import type { CombatAttackStyle, CombatAttackTraits } from "../combat/model/CombatAttack";
import type { NpcEffectImmunityProfile } from "../combat/NpcEffectImmunity";

export type EncounterLifecycle =
    | "idle"
    | "engaged"
    | "transitioning"
    | "resetting"
    | "dead"
    | "disposed";

export interface EncounterMovementProfile {
    readonly wanderRadius?: number;
    readonly aggressionRadius?: number;
    readonly aggressionToleranceTicks?: number;
    readonly aggressionSearchDelayTicks?: number;
    readonly combatLeashRadius?: number;
    readonly retreatInteractionRange?: number;
}

export interface EncounterContext {
    readonly tick: number;
    readonly encounterId: string;
    readonly npcRuntimeId: number;
    readonly npcTypeId: number;
    readonly targetId: number;
    readonly targetDistance: number;
    readonly healthCurrent: number;
    readonly healthMax: number;
    readonly healthPercent: number;
    readonly phaseId: string;
    readonly previousAttackId?: string;
}

export type EncounterAnimationReference =
    | "attack"
    | "melee"
    | "ranged"
    | "magic"
    | "defence"
    | "death"
    | { readonly special: number };

export interface EncounterAttackDefinition {
    readonly id: string;
    readonly type: AttackType;
    readonly style?: CombatAttackStyle | null;
    readonly rangeTiles: number;
    /** Where the NPC tries to stand; it may still attack from range while approaching. */
    readonly preferredDistance?: number;
    readonly speedTicks: number;
    readonly weight?: number;
    readonly priority?: number;
    readonly cooldownTicks?: number;
    readonly minDistance?: number;
    readonly maxDistance?: number;
    /** Preferred DRY path: resolve a named role from npc-combat-defs.json. */
    readonly animation?: EncounterAnimationReference;
    /** Escape hatch for a one-off animation not represented by NPC animation data. */
    readonly animationId?: number;
    readonly projectileId?: number;
    readonly graphicId?: number;
    readonly soundId?: number;
    readonly special?: boolean;
    readonly condition?: (context: EncounterContext) => boolean;
}

export interface EncounterPhaseDefinition {
    readonly id: string;
    /** Inclusive upper health percentage for entering this phase. */
    readonly startsAtHealthPercent: number;
    /** If omitted, every encounter attack is available in this phase. */
    readonly attackIds?: readonly string[];
}

export interface EncounterThresholdDefinition {
    readonly id: string;
    readonly atHealthPercent: number;
}

export interface EncounterDefinition {
    readonly id: string;
    /** Every NPC type used by this encounter, including alternate forms. */
    readonly npcTypeIds: readonly number[];
    readonly maxHealth?: number;
    readonly movement?: EncounterMovementProfile;
    /** Permanent NPC effect immunities shared by every form in this encounter. */
    readonly immunities?: NpcEffectImmunityProfile;
    readonly attacks: readonly EncounterAttackDefinition[];
    readonly phases?: readonly EncounterPhaseDefinition[];
    readonly thresholds?: readonly EncounterThresholdDefinition[];
}

export interface PlannedEncounterAttack {
    readonly definition: EncounterAttackDefinition;
    readonly targetId: number;
    readonly plannedAtTick: number;
    readonly traits: Readonly<CombatAttackTraits>;
}

export interface EncounterThresholdEvent {
    readonly encounterId: string;
    readonly thresholdId: string;
    readonly previousHealth: number;
    readonly currentHealth: number;
    readonly atHealthPercent: number;
}

export interface EncounterOwnedResources {
    readonly npcRuntimeIds: ReadonlySet<number>;
    readonly taskIds: ReadonlySet<string>;
    readonly hazardIds: ReadonlySet<string>;
    readonly locationIds: ReadonlySet<string>;
}
