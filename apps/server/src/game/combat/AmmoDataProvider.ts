/**
 * Ammo Data Provider
 *
 * Core provider interface for ammunition data queries.
 * Gamemodes register their ammo data at startup; the default OSRS
 * implementation lives in AmmoSystem.ts.
 */
import type { AmmoType, AvasDeviceType, EnchantedBoltEffect } from "@server/game/combat/AmmoSystem";

export interface AmmoDataProvider {
    getAmmoType(weaponId: number): AmmoType;
    isAmmoCompatible(weaponId: number, ammoId: number): boolean;
    getValidAmmo(weaponId: number): number[];
    isNoAmmoWeapon(weaponId: number): boolean;
    isDarkBow(weaponId: number): boolean;
    getAvasDeviceType(capeSlotItemId: number): AvasDeviceType | null;
    isAvasDevice(capeSlotItemId: number): boolean;
    getEnchantedBoltEffect(boltId: number): EnchantedBoltEffect | undefined;
}
