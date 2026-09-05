import { AttackType } from "@server/game/combat/AttackType";
import { getWeaponDataProvider } from "@server/game/combat/WeaponDataProvider";
import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import type { NpcState } from "@server/game/npc";
import type { ScriptServices } from "@server/game/scripts/types";

export function mirrorbackMaxHit(weaponId: number, damageType: string | undefined, category: number | undefined): boolean {
    return weaponId === 29796 || damageType === "crush" || category === 5
        || weaponId === 19478 || weaponId === 19481; // light/heavy ballista
}

export function configureMirrorback(npc: NpcState, services: ScriptServices): void {
    npc.forceMaxHitForAttack = (player, attack) => {
        if (attack?.traits.type === AttackType.Magic) return false;
        const weapon = attack?.traits.weaponId ?? player.combat.weaponItemId;
        const provider = getWeaponDataProvider();
        return mirrorbackMaxHit(weapon, provider?.getAttackType(weapon, player.combat.styleSlot),
            provider?.getWeaponData(weapon)?.combatCategory);
    };
    npc.onPlayerHit = (player, damage, type, tick) => {
        if (type !== AttackType.Melee || damage < 2) return;
        const dx = Math.max(npc.tileX - player.tileX, player.tileX - (npc.tileX + npc.size - 1), 0);
        const dy = Math.max(npc.tileY - player.tileY, player.tileY - (npc.tileY + npc.size - 1), 0);
        if (Math.max(dx, dy) <= 1) services.combat.applyNpcDamageToPlayer(npc, player, HITMARK_DAMAGE, Math.floor(damage / 2), tick);
    };
}

export function configureMirrorbackRedirection(boss: NpcState, services: ScriptServices): void {
    boss.transformPlayerHit = (player, damage, tick) => {
        const runtime = services.encounters.ensure(boss);
        const mirror = [...(runtime?.snapshotOwnedResources().npcRuntimeIds ?? [])]
            .map(id => services.combat.getNpc(id))
            .find(npc => npc?.typeId === 13671 && npc.getHitpoints() > 0
                && npc.worldViewId === boss.worldViewId && npc.level === boss.level);
        if (!mirror || damage < 2) return damage;
        const redirected = Math.floor(damage / 2);
        const hpBefore = mirror.getHitpoints();
        services.combat.applyPlayerDamageToNpc(player, mirror, HITMARK_DAMAGE, redirected, tick);
        const actual = Math.min(redirected, Math.max(0, hpBefore - mirror.getHitpoints()));
        if (actual >= 2) services.combat.applyNpcDamageToPlayer(mirror, player, HITMARK_DAMAGE, Math.floor(actual / 2), tick);
        return damage - redirected;
    };
}
