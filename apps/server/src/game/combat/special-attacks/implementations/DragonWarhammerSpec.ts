import { SkillId } from "@august/osrs-engine/skill/skills";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import type { CombatAttack } from "@server/game/combat/model/CombatAttack";
import {
    type WeaponSpecialAttackScript,
    setWeaponSpecialAttackTraitOverrides,
} from "@server/game/combat/special-attacks/WeaponSpecialAttackScript";

const DRAGON_WARHAMMER_ITEM_ID = 13576;
const DRAGON_WARHAMMER_ENERGY_COST = 50;
const DEFENCE_DRAIN_FRACTION = 0.3;

export class DragonWarhammerSpec implements WeaponSpecialAttackScript {
    readonly itemId = DRAGON_WARHAMMER_ITEM_ID;
    readonly energyCost = DRAGON_WARHAMMER_ENERGY_COST;

    modifyAttackTraits(attack: CombatAttack): void {
        setWeaponSpecialAttackTraitOverrides(attack, {
            hitCount: 1,
            accuracyMultiplier: 1,
            damageMultiplier: 1.5,
        });
    }

    onHitApplied(
        attacker: any,
        target: any,
        damageCalculated: number,
        currentMapClock: number,
    ): void {
        void attacker;
        void currentMapClock;
        if (Math.floor(damageCalculated) <= 0) return;

        if (target instanceof PlayerState) {
            const defence = target.skillSystem.getSkill(SkillId.Defence);
            const currentLevel = Math.max(0, Math.floor(defence.baseLevel + defence.boost));
            const drainAmount = Math.floor(currentLevel * DEFENCE_DRAIN_FRACTION);
            target.skillSystem.setSkillBoost(SkillId.Defence, currentLevel - drainAmount);
            return;
        }

        if (target instanceof NpcState) {
            target.drainCombatStatByFraction("defence", DEFENCE_DRAIN_FRACTION);
        }
    }
}

export const DRAGON_WARHAMMER_SPEC = Object.freeze(new DragonWarhammerSpec());
