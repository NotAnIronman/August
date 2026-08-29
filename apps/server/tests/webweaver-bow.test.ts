import assert from "node:assert/strict";

import { calculateAmmoConsumption, getAmmoType } from "@server/game/combat/AmmoSystem";
import { AttackType } from "@server/game/combat/AttackType";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { CombatHitEvaluator } from "@server/game/combat/engine/CombatHitEvaluator";
import { CombatAttackStyle } from "@server/game/combat/model/CombatAttack";
import {
    npcCombatEntityRef,
    playerCombatEntityRef,
} from "@server/game/combat/model/CombatEntityRef";
import { CombatPluginRegistry } from "@server/game/combat/plugins/CombatPluginRegistry";
import { WeaponSpecialAttackRegistry } from "@server/game/combat/special-attacks/WeaponSpecialAttackRegistry";
import { resolveWeaponProfileValue } from "@server/game/combat/plugins/WeaponCombatProfile";
import {
    WEBWEAVER_BOW_ITEM_ID,
    WEBWEAVER_BOW_PROFILE,
    calculateWebweaverSwarmMaxHit,
    consumeWebweaverEtherCharge,
    getWebweaverEtherCharges,
    hasWebweaverWildernessPassive,
    shouldApplyWebweaverPoison,
} from "@server/game/combat/special-attacks/implementations/WebweaverBowSpec";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";

const TEST_GAMEMODE = createTestGamemode("webweaver-bow-test", "Webweaver bow test");

registerSkillConfiguration({
    computeCombatLevel: () => 3,
    skillRestoreIntervalTicks: 100,
    skillBoostDecayIntervalTicks: 100,
    hitpointRegenIntervalTicks: 100,
    hitpointOverhealDecayIntervalTicks: 100,
    preserveDecayMultiplier: 1.5,
});

assert.equal(WEBWEAVER_BOW_PROFILE.specialAttackEnergyCost, 50);
assert.equal(
    CombatPluginRegistry.shared.resolve({ weaponId: WEBWEAVER_BOW_ITEM_ID }).id,
    "core:webweaver_bow",
);
assert.equal(WeaponSpecialAttackRegistry.get(WEBWEAVER_BOW_ITEM_ID)?.energyCost, 50);
assert.equal(getAmmoType(WEBWEAVER_BOW_ITEM_ID), "none");
assert.equal(
    calculateAmmoConsumption(WEBWEAVER_BOW_ITEM_ID, 892, 100, -1, 3200, 3200, () => 0.99)
        .quantityUsed,
    0,
);

assert.equal(calculateWebweaverSwarmMaxHit(31), 13);
assert.equal(calculateWebweaverSwarmMaxHit(31, true), 19);
assert.equal(
    shouldApplyWebweaverPoison(() => 0.249999),
    true,
);
assert.equal(
    shouldApplyWebweaverPoison(() => 0.25),
    false,
);

const player = new PlayerState(100, 3200, 3200, 0, TEST_GAMEMODE);
const outsideTarget = new NpcState(
    200,
    1,
    1,
    -1,
    -1,
    32,
    { x: 3205, y: 3200, level: 0 },
    { maxHitpoints: 100 },
);
const wildernessTarget = new NpcState(
    201,
    1,
    1,
    -1,
    -1,
    32,
    { x: 3205, y: 3600, level: 0 },
    { maxHitpoints: 100 },
);
const revenantCaveTarget = new NpcState(
    202,
    1,
    1,
    -1,
    -1,
    32,
    { x: 3205, y: 10080, level: 0 },
    { maxHitpoints: 100 },
);
assert.equal(hasWebweaverWildernessPassive(outsideTarget), false);
assert.equal(hasWebweaverWildernessPassive(wildernessTarget), true);
assert.equal(hasWebweaverWildernessPassive(revenantCaveTarget), true);

const attack = {
    attacker: playerCombatEntityRef(player.id),
    target: npcCombatEntityRef(outsideTarget.id),
    attackClock: 50,
    traits: {
        type: AttackType.Ranged,
        style: CombatAttackStyle.Rapid,
        rangeTiles: 9,
        speedTicks: 3,
        weaponId: WEBWEAVER_BOW_ITEM_ID,
        specialAttack: true,
    },
} as const;

const outsideSpecial = WEBWEAVER_BOW_PROFILE.handleSpecialAttack?.(player, outsideTarget, attack);
assert.ok(outsideSpecial);
assert.equal(outsideSpecial.hitCount, 4);
assert.equal(outsideSpecial.accuracyMultiplier, 2);
assert.deepEqual(outsideSpecial.accuracyMultiplierStages, [2]);
assert.equal(outsideSpecial.damageMultiplier, 0.4);
assert.deepEqual(outsideSpecial.damageMultiplierStages, [0.4]);
assert.deepEqual(outsideSpecial.damageMultiplierStageRounding, ["ceil"]);
assert.deepEqual(outsideSpecial.hitDelayTicks, [0, 0, 1, 1]);
assert.equal(outsideSpecial.attackAnimation, 9964);
assert.equal(outsideSpecial.projectiles?.length, 4);
assert.deepEqual(
    outsideSpecial.projectiles?.map((projectile) => projectile.id),
    [2354, 2354, 2354, 2354],
);

const outsideContext = {
    attack,
    attacker: player,
    target: outsideTarget,
    currentMapClock: 50,
    distanceTiles: 5,
};
assert.equal(
    resolveWeaponProfileValue(WEBWEAVER_BOW_PROFILE.impactGraphic, outsideContext)?.id,
    2355,
);
assert.equal(
    resolveWeaponProfileValue(WEBWEAVER_BOW_PROFILE.castGraphic, outsideContext),
    undefined,
);

const normalContext = {
    ...outsideContext,
    attack: {
        ...attack,
        traits: { ...attack.traits, specialAttack: false },
    },
};
assert.equal(resolveWeaponProfileValue(WEBWEAVER_BOW_PROFILE.projectile, normalContext)?.id, 2282);
assert.equal(resolveWeaponProfileValue(WEBWEAVER_BOW_PROFILE.castGraphic, normalContext)?.id, 2283);

const wildernessAttack = {
    ...attack,
    target: npcCombatEntityRef(wildernessTarget.id),
};
const wildernessSpecial = WEBWEAVER_BOW_PROFILE.handleSpecialAttack?.(
    player,
    wildernessTarget,
    wildernessAttack,
);
assert.ok(wildernessSpecial);
assert.equal(wildernessSpecial.accuracyMultiplier, 3);
assert.deepEqual(wildernessSpecial.accuracyMultiplierStages, [1.5, 2]);
assert.equal(wildernessSpecial.damageMultiplier, 0.6);
assert.deepEqual(wildernessSpecial.damageMultiplierStages, [1.5, 0.4]);
assert.deepEqual(wildernessSpecial.damageMultiplierStageRounding, ["floor", "ceil"]);

const evaluator = new CombatHitEvaluator({
    resolveEntity: (reference) => {
        if (reference.type === "player") return reference.id === player.id ? player : undefined;
        if (reference.id === outsideTarget.id) return outsideTarget;
        if (reference.id === wildernessTarget.id) return wildernessTarget;
        return undefined;
    },
    getEquipmentBonuses: () => new Array<number>(14).fill(0),
    random: () => 0,
});
const outsideHits = evaluator.evaluateSpecialAttack(attack, {
    ...outsideSpecial,
    maxHitOverride: 31,
});
assert.equal(outsideHits.length, 4);
assert.deepEqual(
    outsideHits.map((hit) => hit.maxHit),
    [13, 13, 13, 13],
);
const wildernessHits = evaluator.evaluateSpecialAttack(wildernessAttack, {
    ...wildernessSpecial,
    maxHitOverride: 31,
});
assert.deepEqual(
    wildernessHits.map((hit) => hit.maxHit),
    [19, 19, 19, 19],
);

player.equipment.setCharges(WEBWEAVER_BOW_ITEM_ID, 2);
assert.equal(getWebweaverEtherCharges(player), 2);
assert.equal(consumeWebweaverEtherCharge(player), true);
assert.equal(getWebweaverEtherCharges(player), 1);
assert.equal(consumeWebweaverEtherCharge(player), true);
assert.equal(consumeWebweaverEtherCharge(player), false);
assert.equal(getWebweaverEtherCharges(player), 0);

console.log("webweaver bow regression tests passed");
