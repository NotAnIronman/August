import assert from "node:assert/strict";

import { AttackType } from "@server/game/combat/AttackType";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { CombatAttackStyle, type CombatAttack } from "@server/game/combat/model/CombatAttack";
import {
    npcCombatEntityRef,
    playerCombatEntityRef,
} from "@server/game/combat/model/CombatEntityRef";
import { CombatPluginRegistry } from "@server/game/combat/plugins/CombatPluginRegistry";
import { WeaponSpecialAttackRegistry } from "@server/game/combat/special-attacks/WeaponSpecialAttackRegistry";
import {
    ABYSSAL_TENTACLE_PROFILE,
    AbyssalTentacleSpec,
    applyBindingTentacleEffects,
} from "@server/game/combat/special-attacks/implementations/AbyssalTentacleSpec";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";

const TEST_GAMEMODE = createTestGamemode(
    "combat-abyssal-tentacle-special-test",
    "Combat abyssal tentacle special test",
);

registerSkillConfiguration({
    computeCombatLevel: () => 3,
    skillRestoreIntervalTicks: 100,
    skillBoostDecayIntervalTicks: 100,
    hitpointRegenIntervalTicks: 100,
    hitpointOverhealDecayIntervalTicks: 100,
    preserveDecayMultiplier: 1.5,
});

const TENTACLE_ITEM_ID = 12006;
const TICK = 50;
const player = new PlayerState(1, 3200, 3200, 0, TEST_GAMEMODE);
const target = new NpcState(2, 1, 1, -1, -1, 32, { x: 3201, y: 3200, level: 0 }, {
    maxHitpoints: 100,
    combatLevel: 32,
});
const attack: CombatAttack = Object.freeze({
    attacker: playerCombatEntityRef(player.id),
    target: npcCombatEntityRef(target.id),
    attackClock: TICK,
    traits: Object.freeze({
        type: AttackType.Melee,
        style: CombatAttackStyle.Aggressive,
        rangeTiles: 1,
        speedTicks: 4,
        weaponId: TENTACLE_ITEM_ID,
        specialAttack: true,
    }),
});

assert.equal(WeaponSpecialAttackRegistry.get(TENTACLE_ITEM_ID)?.energyCost, 50);
assert.equal(CombatPluginRegistry.shared.resolve({ weaponId: TENTACLE_ITEM_ID }).id, "core:abyssal_tentacle");

const special = ABYSSAL_TENTACLE_PROFILE.handleSpecialAttack?.(player, target, attack);
assert.ok(special);
assert.equal(special.energyCostPercent, 50);
assert.equal(special.accuracyMultiplier, 1.25);
assert.equal(special.damageMultiplier, 1);
assert.equal(special.meleeAttackBonusIndex, 1);
assert.equal(special.meleeDefenceBonusIndex, 1);

let poisonCalls = 0;
target.inflictPoison = () => {
    poisonCalls++;
    return true;
};
applyBindingTentacleEffects(target, TICK, () => 0.499999);
assert.equal(target.isFrozen(TICK + 7), true);
assert.equal(target.isFrozen(TICK + 8), false);
assert.equal(poisonCalls, 1);

const noPoisonTarget = new NpcState(3, 1, 1, -1, -1, 32, { x: 3202, y: 3200, level: 0 }, {
    maxHitpoints: 100,
    combatLevel: 32,
});
let noPoisonCalls = 0;
noPoisonTarget.inflictPoison = () => {
    noPoisonCalls++;
    return true;
};
applyBindingTentacleEffects(noPoisonTarget, TICK, () => 0.5);
assert.equal(noPoisonTarget.isFrozen(TICK), true);
assert.equal(noPoisonCalls, 0);

const script = new AbyssalTentacleSpec();
script.modifyAttackTraits(attack);
assert.equal(script.onSpecialActivated(player, target, TICK), undefined);

console.log("abyssal tentacle special regression tests passed");
