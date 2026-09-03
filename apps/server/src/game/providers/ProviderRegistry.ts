/**
 * Central registry for all gamemode-scoped data providers.
 *
 * Providers are registered by gamemodes during initialize() and consumed by
 * core engine systems through delegate functions in each provider module.
 * The registry is reset on gamemode bootstrap so providers don't leak across
 * gamemode switches.
 */
import type { AmmoDataProvider } from "@server/game/combat/AmmoDataProvider";
import type { CombatStyleSequenceProvider } from "@server/game/combat/CombatStyleSequenceProvider";
import type { EquipmentBonusProvider } from "@server/game/combat/EquipmentBonusProvider";
import type { InstantUtilitySpecialProvider } from "@server/game/combat/special-attacks/InstantUtilitySpecialProvider";
import type { SkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import type { FallbackSpecialAttackProvider } from "@server/game/combat/special-attacks/FallbackSpecialAttackProvider";
import type { SpecialAttackVisualProvider } from "@server/game/combat/special-attacks/SpecialAttackVisualProvider";
import type { SpellXpProvider } from "@server/game/combat/SpellXpProvider";
import type { WeaponDataProvider } from "@server/game/combat/WeaponDataProvider";
import type { ProjectileParamsProvider } from "@server/game/data/ProjectileParamsProvider";
import type { RuneDataProvider } from "@server/game/data/RuneDataProvider";
import type { SpellDataProvider } from "@server/game/spells/SpellDataProvider";

export interface ProviderRegistryState {
    weaponData?: WeaponDataProvider;
    fallbackSpecialAttack?: FallbackSpecialAttackProvider;
    combatStyleSequence?: CombatStyleSequenceProvider;
    equipmentBonus?: EquipmentBonusProvider;
    spellXp?: SpellXpProvider;
    specialAttackVisual?: SpecialAttackVisualProvider;
    instantUtilitySpecial?: InstantUtilitySpecialProvider;
    skillConfiguration?: SkillConfiguration;
    spellData?: SpellDataProvider;
    runeData?: RuneDataProvider;
    projectileParams?: ProjectileParamsProvider;
    ammoData?: AmmoDataProvider;
}

const _registry: ProviderRegistryState = {};

export function getProviderRegistry(): ProviderRegistryState {
    return _registry;
}

export function resetProviderRegistry(): void {
    // Keep the stable registry object (consumers may retain its reference), but
    // remove every owned provider. Iterating the live keys makes reset complete
    // by construction when a new optional provider is added to the interface.
    for (const key of Object.keys(_registry) as Array<keyof ProviderRegistryState>) {
        delete _registry[key];
    }
}
