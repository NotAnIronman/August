/**
 * Combat Module Index
 *
 * Exports all combat-related types, classes, and utilities.
 */

// Core types
export { AttackType, normalizeAttackType } from "@server/game/combat/AttackType";
export {
    DEFAULT_NPC_MAGIC_RANGE,
    DEFAULT_NPC_MELEE_RANGE,
    DEFAULT_NPC_RANGED_RANGE,
    MAGIC_WEAPON_CATEGORIES,
    resolveNpcAttackRange,
    resolveNpcAttackType,
    POWERED_STAFF_CATEGORIES,
    RANGED_WEAPON_CATEGORIES,
    SALAMANDER_WEAPON_CATEGORY,
    resolvePlayerAttackReach,
    resolvePlayerAttackType,
    type NpcCombatRuleState,
    type PlayerCombatRuleState,
    type PlayerAttackReachOptions,
} from "@server/game/combat/CombatRules";

// Effect applicator
export {
    CombatEffectApplicator,
    combatEffectApplicator,
    type SkillSyncCallback,
} from "@server/game/combat/CombatEffectApplicator";

// Hit effects
export {
    HITMARK_BLOCK,
    HITMARK_DAMAGE,
    HITMARK_POISON,
    HITMARK_DISEASE,
    HITMARK_VENOM,
    HITMARK_REFLECT,
    HITMARK_PRAYER_SPLASH,
    HITMARK_REGEN,
    HITMARK_HEAL,
    HitEffectType,
    type HitEffectConfig,
    type StatusHitsplat,
    resolveHitEffect,
    DEFAULT_POISON_INTERVAL_TICKS,
    DEFAULT_VENOM_INTERVAL_TICKS,
    DEFAULT_DISEASE_INTERVAL_TICKS,
    DEFAULT_REGEN_INTERVAL_TICKS,
} from "@server/game/combat/HitEffects";

// Combat XP
export {
    calculateCombatXp,
    getDefaultStyleMode,
    MeleeStyle,
    RangedStyle,
    MagicStyle,
    type StyleMode,
    type MeleeStyleMode,
    type RangedStyleMode,
    type MagicStyleMode,
    type CombatXpAward,
} from "@server/game/combat/CombatXp";

// Combat Action (RSMod parity: PawnPathAction + combat cycle)
export {
    areBordering,
    areDiagonal,
    areOverlapping,
    hasDirectMeleeReach,
    hasDirectMeleePath,
    isWithinAttackRange,
    walkToAttackRange,
    combatCycle,
    createCombatGenerator,
    CombatCycleResult,
    type CombatCycleContext,
} from "@server/game/combat/CombatAction";

// Special attacks
export {
    getFallbackSpecialAttack,
    type FallbackSpecialAttackDefinition,
    type FallbackSpecialAttackProvider,
} from "@server/game/combat/special-attacks/FallbackSpecialAttackProvider";

// Combat style sequences
export {
    getMeleeAttackSequenceForCategory,
    registerCombatStyleSequenceProvider,
    getCombatStyleSequenceProvider,
    type CombatStyleSlot,
    type CombatStyleSequenceProvider,
} from "@server/game/combat/CombatStyleSequenceProvider";

// Skill configuration
export {
    registerSkillConfiguration,
    getSkillConfiguration,
    getSkillRestoreIntervalTicks,
    getSkillBoostDecayIntervalTicks,
    getHitpointRegenIntervalTicks,
    getHitpointOverhealDecayIntervalTicks,
    getPreserveDecayMultiplier,
    type SkillConfiguration,
} from "@server/game/combat/SkillConfigurationProvider";

// Equipment bonuses
export {
    calculateEquipmentBonuses,
    registerEquipmentBonusProvider,
    getEquipmentBonusProvider,
    type TargetInfo,
    type SlayerTaskInfo,
    type EquipmentBonusResult,
    type EquipmentBonusProvider,
} from "@server/game/combat/EquipmentBonusProvider";

// Ammo system
export {
    AmmoSystem,
    getEnchantedBoltEffect,
    doesBoltEffectActivate,
    type EnchantedBoltEffect,
} from "@server/game/combat/AmmoSystem";

// Poison/Venom system
// Note: Tick processing is in NpcState.processPoison/processVenom
// PoisonVenomSystem provides apply/cure utilities and item constants
export { PoisonVenomSystem, poisonVenomSystem } from "@server/game/combat/PoisonVenomSystem";

// Multi-combat zones
export { MultiCombatSystem, multiCombatSystem } from "@server/game/combat/MultiCombatZones";

// Damage tracking for loot
export {
    DamageTracker,
    damageTracker,
    type DamageType,
    type PlayerDamageSummary,
    type DropEligibility,
    calculateXpShare,
} from "@server/game/combat/DamageTracker";

