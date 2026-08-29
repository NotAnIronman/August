import type { WeaponCombatProfile } from "@server/game/combat/plugins/WeaponCombatProfile";
import { ARMADYL_GODSWORD_PROFILE } from "@server/game/combat/special-attacks/implementations/ArmadylGodswordSpec";
import { ABYSSAL_TENTACLE_PROFILE } from "@server/game/combat/special-attacks/implementations/AbyssalTentacleSpec";
import { DARK_BOW_PROFILE } from "@server/game/combat/special-attacks/implementations/DarkBowSpec";
import { DRAGON_CLAWS_PROFILE } from "@server/game/combat/special-attacks/implementations/DragonClawsSpec";
import { DRAGON_DAGGER_SPECIAL_ATTACK_PROFILE } from "@server/game/combat/special-attacks/implementations/DragonDaggerSpecialAttack";
import { DRAGON_HALBERD_PROFILE } from "@server/game/combat/special-attacks/implementations/DragonHalberdSpec";
import { DRAGON_KNIFE_PROFILE } from "@server/game/combat/special-attacks/implementations/DragonKnifeSpec";
import { DRAGON_SPEAR_PROFILE } from "@server/game/combat/special-attacks/implementations/DragonSpearSpec";
import { GRANITE_MAUL_SPECIAL_ATTACK_PROFILES } from "@server/game/combat/special-attacks/implementations/GraniteMaulSpecialAttack";
import { HEAVY_BALLISTA_PROFILE } from "@server/game/combat/special-attacks/implementations/HeavyBallistaSpec";
import { LIGHT_BALLISTA_PROFILE } from "@server/game/combat/special-attacks/implementations/LightBallistaSpec";
import { MAGIC_COMP_BOW_PROFILE, MAGIC_LONGBOW_PROFILE } from "@server/game/combat/special-attacks/implementations/MagicLongbowSpec";
import { MAGIC_SHORTBOW_SPECIAL_ATTACK_PROFILES } from "@server/game/combat/special-attacks/implementations/MagicShortbowSpecialAttack";
import { NOXIOUS_HALBERD_PROFILE } from "@server/game/combat/special-attacks/implementations/NoxiousHalberdSpec";
import { OSMUMTENS_FANG_PROFILE } from "@server/game/combat/special-attacks/implementations/OsmumtensFangSpec";
import { ROSEWOOD_BLOWPIPE_PROFILE } from "@server/game/combat/special-attacks/implementations/RosewoodBlowpipeSpec";
import { RUNE_CLAWS_PROFILE } from "@server/game/combat/special-attacks/implementations/RuneClawsSpec";
import { SARADOMIN_GODSWORD_PROFILE } from "@server/game/combat/special-attacks/implementations/SaradominGodswordSpec";
import { SARADOMIN_SWORD_PROFILE } from "@server/game/combat/special-attacks/implementations/SaradominSwordSpec";
import { SARADOMINS_BLESSED_SWORD_PROFILE } from "@server/game/combat/special-attacks/implementations/SaradominsBlessedSwordSpec";
import { SCYTHE_OF_VITUR_PROFILE } from "@server/game/combat/special-attacks/implementations/ScytheOfViturSpec";
import { TOXIC_BLOWPIPE_PROFILE } from "@server/game/combat/special-attacks/implementations/ToxicBlowpipeSpec";
import { VESTAS_SPEAR_BH_PROFILE } from "@server/game/combat/special-attacks/implementations/VestasSpearBhSpec";
import { WEBWEAVER_BOW_PROFILE } from "@server/game/combat/special-attacks/implementations/WebweaverBowSpec";

export { ANCIENT_GODSWORD_SPEC, AncientGodswordSpec } from "@server/game/combat/special-attacks/implementations/AncientGodswordSpec";
export { ANCIENT_MACE_SPEC, AncientMaceSpec } from "@server/game/combat/special-attacks/implementations/AncientMaceSpec";
export { ABYSSAL_WHIP_SPEC, AbyssalWhipSpec } from "@server/game/combat/special-attacks/implementations/AbyssalWhipSpec";
export {
    ABYSSAL_TENTACLE_PROFILE,
    ABYSSAL_TENTACLE_SPEC,
    AbyssalTentacleSpec,
    applyBindingTentacleEffects,
} from "@server/game/combat/special-attacks/implementations/AbyssalTentacleSpec";
export { ABYSSAL_DAGGER_SPEC, ABYSSAL_DAGGER_SPECS, AbyssalDaggerSpec } from "@server/game/combat/special-attacks/implementations/AbyssalDaggerSpec";
export { ABYSSAL_BLUDGEON_SPEC, AbyssalBludgeonSpec } from "@server/game/combat/special-attacks/implementations/AbyssalBludgeonSpec";
export { ACCURSED_SCEPTRE_SPEC, AccursedSceptreSpec } from "@server/game/combat/special-attacks/implementations/AccursedSceptreSpec";
export { ARCLIGHT_SPEC, ArclightSpec } from "@server/game/combat/special-attacks/implementations/ArclightSpec";
export { ARKAN_BLADE_BURN_PROFILE_ID, ARKAN_BLADE_SPEC, ArkanBladeSpec } from "@server/game/combat/special-attacks/implementations/ArkanBladeSpec";
export { ARMADYL_CROSSBOW_SPEC, ArmadylCrossbowSpec } from "@server/game/combat/special-attacks/implementations/ArmadylCrossbowSpec";
export {
    ARMADYL_GODSWORD_PROFILE,
    ARMADYL_GODSWORD_SPEC,
    ARMADYL_GODSWORD_SPECS,
    ArmadylGodswordSpec,
} from "@server/game/combat/special-attacks/implementations/ArmadylGodswordSpec";
export { BANDOS_GODSWORD_SPEC, BandosGodswordSpec } from "@server/game/combat/special-attacks/implementations/BandosGodswordSpec";
export {
    BLUE_MOON_SPEAR_SPEC,
    BLUE_MOON_SPEAR_SPECS,
    BlueMoonSpearSpec,
} from "@server/game/combat/special-attacks/implementations/BlueMoonSpearSpec";
export { BARRELCHEST_ANCHOR_SPEC, BarrelchestAnchorSpec } from "@server/game/combat/special-attacks/implementations/BarrelchestAnchorSpec";
export { BONE_DAGGER_SPEC, BONE_DAGGER_VARIANT_SPECS, BoneDaggerSpec } from "@server/game/combat/special-attacks/implementations/BoneDaggerSpec";
export { BRINE_SABRE_SPEC, BrineSabreSpec } from "@server/game/combat/special-attacks/implementations/BrineSabreSpec";
export { BURNING_CLAWS_SPEC, BurningClawsSpec } from "@server/game/combat/special-attacks/implementations/BurningClawsSpec";
export { CRIMSON_KISTEN_SPEC, CrimsonKistenSpec } from "@server/game/combat/special-attacks/implementations/CrimsonKistenSpec";
export { DARKLIGHT_SPEC, DarklightSpec } from "@server/game/combat/special-attacks/implementations/DarklightSpec";
export {
    DARK_BOW_PROFILE,
    DARK_BOW_SPEC,
    DARK_BOW_SPECS,
    DarkBowSpec,
    isDragonArrow,
    resolveDarkBowSpecialConfiguration,
} from "@server/game/combat/special-attacks/implementations/DarkBowSpec";
export { DAWNBRINGER_SPEC, DawnbringerSpec } from "@server/game/combat/special-attacks/implementations/DawnbringerSpec";
export { DORGESHUUN_CROSSBOW_SPEC, DorgeshuunCrossbowSpec } from "@server/game/combat/special-attacks/implementations/DorgeshuunCrossbowSpec";
export { DINHS_BULWARK_SPEC, DinhsBulwarkSpec } from "@server/game/combat/special-attacks/implementations/DinhsBulwarkSpec";
export {
    DUAL_MACUAHUITL_SPEC,
    DUAL_MACUAHUITL_SPECS,
    DualMacuahuitlSpec,
} from "@server/game/combat/special-attacks/implementations/DualMacuahuitlSpec";
export {
    ELDRITCH_NIGHTMARE_STAFF_SPEC,
    EldritchNightmareStaffSpec,
} from "@server/game/combat/special-attacks/implementations/EldritchNightmareStaffSpec";
export {
    VOLATILE_NIGHTMARE_STAFF_SPEC,
    VOLATILE_NIGHTMARE_STAFF_SPECS,
    VolatileNightmareStaffSpec,
} from "@server/game/combat/special-attacks/implementations/VolatileNightmareStaffSpec";
export { ECLIPSE_ATLATL_SPEC, ECLIPSE_ATLATL_SPECS, EclipseAtlatlSpec } from "@server/game/combat/special-attacks/implementations/EclipseAtlatlSpec";
export {
    ELDER_MAUL_ORNAMENTED_SPEC,
    ELDER_MAUL_SPEC,
    ELDER_MAUL_SPECS,
    ElderMaulSpec,
} from "@server/game/combat/special-attacks/implementations/ElderMaulSpec";
export { EYE_OF_AYAK_SPEC, EyeOfAyakSpec } from "@server/game/combat/special-attacks/implementations/EyeOfAyakSpec";
export { EMBERLIGHT_SPEC, EmberlightSpec } from "@server/game/combat/special-attacks/implementations/EmberlightSpec";
export { EXCALIBUR_SPEC, ExcaliburSpec } from "@server/game/combat/special-attacks/implementations/ExcaliburSpec";
export {
    DRAGON_DAGGER_SPECIAL_ATTACK_SCRIPTS,
    DragonDaggerSpecialAttackScript,
} from "@server/game/combat/special-attacks/implementations/DragonDaggerSpecialAttack";
export { DRAGON_WARHAMMER_SPEC, DragonWarhammerSpec } from "@server/game/combat/special-attacks/implementations/DragonWarhammerSpec";
export { DRAGON_AXE_SPEC, DRAGON_AXE_VARIANT_SPECS, DragonAxeSpec } from "@server/game/combat/special-attacks/implementations/DragonAxeSpec";
export { DRAGON_BATTLEAXE_SPEC, DragonBattleaxeSpec } from "@server/game/combat/special-attacks/implementations/DragonBattleaxeSpec";
export { DRAGON_CROSSBOW_SPEC, DragonCrossbowSpec } from "@server/game/combat/special-attacks/implementations/DragonCrossbowSpec";
export {
    DRAGON_CLAWS_ALL_MISS_PATTERNS,
    DRAGON_CLAWS_PROFILE,
    DRAGON_CLAWS_SPEC,
    DRAGON_CLAWS_SPECS,
    DragonClawsSpec,
    calculateDragonClawsHitDistribution,
} from "@server/game/combat/special-attacks/implementations/DragonClawsSpec";
export { DRAGON_LONGSWORD_SPEC, DragonLongswordSpec } from "@server/game/combat/special-attacks/implementations/DragonLongswordSpec";
export {
    DRAGON_KNIFE_PROFILE,
    DRAGON_KNIFE_SPEC,
    DRAGON_KNIFE_SPECS,
    DragonKnifeSpec,
} from "@server/game/combat/special-attacks/implementations/DragonKnifeSpec";
export { DRAGON_MACE_SPEC, DragonMaceSpec } from "@server/game/combat/special-attacks/implementations/DragonMaceSpec";
export { DRAGON_SWORD_SPEC, DragonSwordSpec } from "@server/game/combat/special-attacks/implementations/DragonSwordSpec";
export {
    DRAGON_SPEAR_ITEM_IDS,
    DRAGON_SPEAR_PROFILE,
    DRAGON_SPEAR_SPEC,
    DRAGON_SPEAR_SPECS,
    DragonSpearSpec,
    applyDragonSpearShove,
} from "@server/game/combat/special-attacks/implementations/DragonSpearSpec";
export { DRAGON_THROWNAXE_SPEC, DragonThrownaxeSpec } from "@server/game/combat/special-attacks/implementations/DragonThrownaxeSpec";
export { DRAGON_SCIMITAR_SPEC, DragonScimitarSpec } from "@server/game/combat/special-attacks/implementations/DragonScimitarSpec";
export {
    CRYSTAL_HALBERD_SPEC,
    DRAGON_HALBERD_PROFILE,
    DRAGON_HALBERD_SPEC,
    HALBERD_SWEEP_TARGETING,
    DragonHalberdSpec,
} from "@server/game/combat/special-attacks/implementations/DragonHalberdSpec";
export { DRAGON_HASTA_SPEC, DRAGON_HASTA_SPECS, DragonHastaSpec } from "@server/game/combat/special-attacks/implementations/DragonHastaSpec";
export { DRAGON_2H_SWORD_SPEC, Dragon2hSwordSpec } from "@server/game/combat/special-attacks/implementations/Dragon2hSwordSpec";
export {
    DRAGON_HARPOON_SPEC,
    DRAGON_HARPOON_VARIANT_SPECS,
    DragonHarpoonSpec,
} from "@server/game/combat/special-attacks/implementations/DragonHarpoonSpec";
export {
    DRAGON_PICKAXE_SPEC,
    DRAGON_PICKAXE_VARIANT_SPECS,
    DragonPickaxeSpec,
} from "@server/game/combat/special-attacks/implementations/DragonPickaxeSpec";
export {
    GRANITE_MAUL_ITEM_IDS,
    GRANITE_MAUL_ORNATE_ENERGY_COST,
    GRANITE_MAUL_SPECIAL_ATTACK_PROFILE,
    GRANITE_MAUL_SPECIAL_ATTACK_PROFILES,
    GRANITE_MAUL_SPECIAL_ATTACK_SCRIPTS,
    GRANITE_MAUL_STANDARD_ENERGY_COST,
    ORNATE_GRANITE_MAUL_ITEM_ID,
    ORNATE_GRANITE_MAUL_SPECIAL_ATTACK_PROFILE,
    GraniteMaulSpecialAttackScript,
    getGraniteMaulSpecialAttackEnergyCost,
    isGraniteMaul,
    queueGraniteMaulSpecialAttackInput,
} from "@server/game/combat/special-attacks/implementations/GraniteMaulSpecialAttack";
export { GRANITE_HAMMER_SPEC, GraniteHammerSpec } from "@server/game/combat/special-attacks/implementations/GraniteHammerSpec";
export {
    HEAVY_BALLISTA_PROFILE,
    HEAVY_BALLISTA_SPEC,
    HEAVY_BALLISTA_SPECS,
    HeavyBallistaSpec,
} from "@server/game/combat/special-attacks/implementations/HeavyBallistaSpec";
export {
    LIGHT_BALLISTA_PROFILE,
    LIGHT_BALLISTA_SPEC,
    LIGHT_BALLISTA_SPECS,
    LightBallistaSpec,
} from "@server/game/combat/special-attacks/implementations/LightBallistaSpec";
export {
    MAGIC_SHORTBOW_SPECIAL_ATTACK_SCRIPTS,
    MagicShortbowSpecialAttackScript,
} from "@server/game/combat/special-attacks/implementations/MagicShortbowSpecialAttack";
export {
    MAGIC_COMP_BOW_PROFILE,
    MAGIC_COMP_BOW_SPEC,
    MAGIC_LONGBOW_PROFILE,
    MAGIC_LONGBOW_SPEC,
    MAGIC_LONGBOW_SPECS,
    MagicLongbowSpec,
} from "@server/game/combat/special-attacks/implementations/MagicLongbowSpec";
export {
    MORRIGANS_THROWING_AXE_BH_SPEC,
    MorrigansThrowingAxeBhSpec,
} from "@server/game/combat/special-attacks/implementations/MorrigansThrowingAxeBhSpec";
export {
    MORRIGANS_JAVELIN_BLEED_PROFILE_ID,
    MORRIGANS_JAVELIN_SPEC,
    MORRIGANS_JAVELIN_SPECS,
    MorrigansJavelinSpec,
} from "@server/game/combat/special-attacks/implementations/MorrigansJavelinSpec";
export {
    NOXIOUS_HALBERD_PROFILE,
    NOXIOUS_HALBERD_SPEC,
    NoxiousHalberdSpec,
} from "@server/game/combat/special-attacks/implementations/NoxiousHalberdSpec";
export {
    OSMUMTENS_FANG_PROFILE,
    OSMUMTENS_FANG_SPEC,
    OSMUMTENS_FANG_SPECS,
    OsmumtensFangSpec,
} from "@server/game/combat/special-attacks/implementations/OsmumtensFangSpec";
export { VOIDWAKER_SPEC, VoidwakerSpec } from "@server/game/combat/special-attacks/implementations/VoidwakerSpec";
export {
    TOXIC_BLOWPIPE_PROFILE,
    TOXIC_BLOWPIPE_SPEC,
    ToxicBlowpipeSpec,
} from "@server/game/combat/special-attacks/implementations/ToxicBlowpipeSpec";
export { TOXIC_STAFF_OF_THE_DEAD_SPEC, ToxicStaffOfTheDeadSpec } from "@server/game/combat/special-attacks/implementations/ToxicStaffOfTheDeadSpec";
export { TONALZTICS_OF_RALOS_SPEC, TonalzticsOfRalosSpec } from "@server/game/combat/special-attacks/implementations/TonalzticsOfRalosSpec";
export { PURGING_STAFF_SPEC, PurgingStaffSpec } from "@server/game/combat/special-attacks/implementations/PurgingStaffSpec";
export { RUNE_THROWNAXE_SPEC, RuneThrownaxeSpec } from "@server/game/combat/special-attacks/implementations/RuneThrownaxeSpec";
export {
    ROSEWOOD_BLOWPIPE_PROFILE,
    ROSEWOOD_BLOWPIPE_SPEC,
    RosewoodBlowpipeSpec,
} from "@server/game/combat/special-attacks/implementations/RosewoodBlowpipeSpec";
export { RUNE_CLAWS_PROFILE, RUNE_CLAWS_SPEC, RuneClawsSpec } from "@server/game/combat/special-attacks/implementations/RuneClawsSpec";
export {
    SARADOMINS_BLESSED_SWORD_PROFILE,
    SARADOMINS_BLESSED_SWORD_SPEC,
    SaradominsBlessedSwordSpec,
} from "@server/game/combat/special-attacks/implementations/SaradominsBlessedSwordSpec";
export { SOULFLAME_HORN_SPEC, SoulflameHornSpec } from "@server/game/combat/special-attacks/implementations/SoulflameHornSpec";
export { SUNSPEAR_SPEC, SunspearSpec } from "@server/game/combat/special-attacks/implementations/SunspearSpec";
export { VESTAS_SPEAR_DEADMAN_SPEC, VestasSpearDeadmanSpec } from "@server/game/combat/special-attacks/implementations/VestasSpearDeadmanSpec";
export {
    VESTAS_SPEAR_BH_PROFILE,
    VESTAS_SPEAR_BH_SPEC,
    VestasSpearBhSpec,
} from "@server/game/combat/special-attacks/implementations/VestasSpearBhSpec";
export {
    WEBWEAVER_BOW_ACTIVATION_ETHER,
    WEBWEAVER_BOW_ITEM_ID,
    WEBWEAVER_BOW_MAX_AMMO_ETHER,
    WEBWEAVER_BOW_PROFILE,
    WEBWEAVER_BOW_REVENANT_ETHER_ITEM_ID,
    WEBWEAVER_BOW_SPEC,
    WEBWEAVER_BOW_UNCHARGED_ITEM_ID,
    WebweaverBowSpec,
    calculateWebweaverSwarmMaxHit,
    consumeWebweaverEtherCharge,
    getWebweaverEtherCharges,
    hasWebweaverWildernessPassive,
    shouldApplyWebweaverPoison,
} from "@server/game/combat/special-attacks/implementations/WebweaverBowSpec";
export {
    ZARYTE_CROSSBOW_SPEC,
    ZARYTE_CROSSBOW_SPECS,
    ZaryteCrossbowSpec,
} from "@server/game/combat/special-attacks/implementations/ZaryteCrossbowSpec";
export {
    VESTAS_LONGSWORD_BH_SPEC,
    VESTAS_LONGSWORD_BH_SPECS,
    VestasLongswordBhSpec,
} from "@server/game/combat/special-attacks/implementations/VestasLongswordBhSpec";
export {
    SARADOMIN_GODSWORD_PROFILE,
    SARADOMIN_GODSWORD_SPECS,
    SaradominGodswordSpec,
} from "@server/game/combat/special-attacks/implementations/SaradominGodswordSpec";
export {
    SARADOMIN_SWORD_PROFILE,
    SARADOMIN_SWORD_SPEC,
    SaradominSwordSpec,
} from "@server/game/combat/special-attacks/implementations/SaradominSwordSpec";
export { SEERCULL_SPEC, SeercullSpec } from "@server/game/combat/special-attacks/implementations/SeercullSpec";
export { STATIUS_WARHAMMER_BH_SPEC, StatiusWarhammerBhSpec } from "@server/game/combat/special-attacks/implementations/StatiusWarhammerBhSpec";
export { STAFF_OF_THE_DEAD_SPEC, StaffOfTheDeadSpec } from "@server/game/combat/special-attacks/implementations/StaffOfTheDeadSpec";
export { STAFF_OF_LIGHT_SPEC, StaffOfLightSpec } from "@server/game/combat/special-attacks/implementations/StaffOfLightSpec";
export { STAFF_OF_BALANCE_SPEC, StaffOfBalanceSpec } from "@server/game/combat/special-attacks/implementations/StaffOfBalanceSpec";
export {
    KERIS_PARTISAN_OF_THE_SUN_SPEC,
    KerisPartisanOfTheSunSpec,
} from "@server/game/combat/special-attacks/implementations/KerisPartisanOfTheSunSpec";
export {
    KERIS_PARTISAN_OF_CORRUPTION_SPEC,
    KerisPartisanOfCorruptionSpec,
} from "@server/game/combat/special-attacks/implementations/KerisPartisanOfCorruptionSpec";

export const CORE_SPECIAL_ATTACK_PROFILES: readonly WeaponCombatProfile[] = Object.freeze([
    ABYSSAL_TENTACLE_PROFILE,
    DRAGON_DAGGER_SPECIAL_ATTACK_PROFILE,
    ...GRANITE_MAUL_SPECIAL_ATTACK_PROFILES,
    ...MAGIC_SHORTBOW_SPECIAL_ATTACK_PROFILES,
    MAGIC_LONGBOW_PROFILE,
    MAGIC_COMP_BOW_PROFILE,
    TOXIC_BLOWPIPE_PROFILE,
    SARADOMIN_GODSWORD_PROFILE,
    ARMADYL_GODSWORD_PROFILE,
    HEAVY_BALLISTA_PROFILE,
    LIGHT_BALLISTA_PROFILE,
    NOXIOUS_HALBERD_PROFILE,
    OSMUMTENS_FANG_PROFILE,
    RUNE_CLAWS_PROFILE,
    SARADOMINS_BLESSED_SWORD_PROFILE,
    DARK_BOW_PROFILE,
    DRAGON_CLAWS_PROFILE,
    DRAGON_HALBERD_PROFILE,
    DRAGON_KNIFE_PROFILE,
    DRAGON_SPEAR_PROFILE,
    ROSEWOOD_BLOWPIPE_PROFILE,
    SARADOMIN_SWORD_PROFILE,
    SCYTHE_OF_VITUR_PROFILE,
    VESTAS_SPEAR_BH_PROFILE,
    WEBWEAVER_BOW_PROFILE,
]);

export {
    DRAGON_DAGGER_SPECIAL_ATTACK_PROFILE,
    MAGIC_SHORTBOW_SPECIAL_ATTACK_PROFILES,
};
