import type { BossHealthBarMarker } from "@august/protocol/ui/bossHealthBar";
import type { AttackType } from "@server/game/combat/AttackType";
import type { CombatAttackEffects, CombatAttackStyle, CombatAttackTraits } from "@server/game/combat/model/CombatAttack";
import type { NpcEffectImmunityProfile } from "@server/game/combat/NpcEffectImmunity";

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
    readonly targetProtectingFromMelee: boolean;
    /** Whether the current target is actively attacking this NPC. */
    readonly targetIsAttackingNpc: boolean;
}

export type EncounterAnimationReference =
    | "attack"
    | "melee"
    | "ranged"
    | "magic"
    | "defence"
    | "death"
    | "spawn"
    /** Legacy anonymous special slot, kept for existing encounters. */
    | { readonly special: number }
    /** Named mechanic pool, e.g. { special: "slam" }. */
    | { readonly special: string };

export interface EncounterAttackDefinition {
    readonly id: string;
    readonly type: AttackType;
    readonly style?: CombatAttackStyle | null;
    readonly rangeTiles: number;
    /** Where the NPC tries to stand; it may still attack from range while approaching. */
    readonly preferredDistance?: number;
    readonly speedTicks: number;
    readonly maxHit?: number;
    /** Static or context-sensitive selection weight. */
    readonly weight?: number | ((context: EncounterContext) => number);
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
    readonly effects?: Readonly<CombatAttackEffects>;
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

/**
 * Boss-HUD metadata shared by every instance that contains this encounter.
 * The displayed NPC type defaults to the encounter's first form.
 */
export interface EncounterBossHealthBarDefinition {
    readonly name: string;
    readonly npcTypeId?: number;
    /**
     * Explicit HUD notches. An empty list intentionally disables notches; when
     * omitted, encounter phases and health thresholds are derived automatically.
     */
    readonly markers?: readonly BossHealthBarMarker[];
}

/**
 * Opt-in account progression for a boss encounter.  Keeping this beside the
 * encounter definition makes killcount chat and the collection-log counter a
 * default feature of new modular bosses instead of a separate content patch.
 */
export interface EncounterKillcountDefinition {
    readonly name: string;
    readonly collectionLogStructId: number;
    readonly milestoneInterval?: number;
}

export interface EncounterDefinition {
    readonly id: string;
    /** Every NPC type used by this encounter, including alternate forms. */
    readonly npcTypeIds: readonly number[];
    readonly maxHealth?: number;
    /** Opts this encounter into the reusable boss-health-bar lifecycle. */
    readonly bossHealthBar?: EncounterBossHealthBarDefinition;
    /** Opts this encounter into shared boss killcount and collection-log tracking. */
    readonly killcount?: EncounterKillcountDefinition;
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
    /** Deterministic selector used when the animation role contains a pool. */
    readonly animationSelector: number;
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
    /** Scheduler-native task handles. Core schedulers use numbers; named adapters may use strings. */
    readonly taskIds: ReadonlySet<string | number>;
    readonly hazardIds: ReadonlySet<string>;
    readonly locationIds: ReadonlySet<string>;
}
