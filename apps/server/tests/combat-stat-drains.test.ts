/**
 * Regression coverage for NPC stat-draining special attacks.
 *
 * Run with: pnpm exec tsx tests/combat-stat-drains.test.ts
 */
import assert from "node:assert/strict";

import { createFallbackSpecialAttackProvider } from "@server/content/gamemodes/vanilla/combat/FallbackSpecialAttackCatalog";
import {
    CombatEffectApplicator,
    type FallbackSpecialAttackEffects,
} from "@server/game/combat/CombatEffectApplicator";
import { type NpcCombatProfile, NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";

function createNpc(levels: Partial<NpcCombatProfile> = {}): NpcState {
    const profile: NpcCombatProfile = {
        attackLevel: 3,
        strengthLevel: 4,
        defenceLevel: 99,
        magicLevel: 2,
        rangedLevel: 1,
        attackBonus: 0,
        strengthBonus: 0,
        magicBonus: 0,
        rangedBonus: 0,
        defenceStab: 0,
        defenceSlash: 0,
        defenceCrush: 0,
        defenceMagic: 0,
        defenceRanged: 0,
        maxHit: 1,
        attackSpeed: 4,
        attackType: "melee",
        species: [],
        ...levels,
    };
    return new NpcState(
        1,
        1,
        1,
        -1,
        -1,
        32,
        { x: 3200, y: 3200, level: 0 },
        {
            combatProfile: profile,
        },
    );
}

const applicator = new CombatEffectApplicator();
const attacker = {} as PlayerState;

{
    const npc = createNpc();
    const effects: FallbackSpecialAttackEffects = { drainDefence: 0.3 };

    applicator.applySpecialEffects(attacker, npc, 0, effects, 1);
    assert.equal(
        npc.getCombatStat("defence"),
        99,
        "dragon warhammer must not drain Defence on a zero-damage hit",
    );

    applicator.applySpecialEffects(attacker, npc, 1, effects, 2);
    assert.equal(
        npc.getCombatStat("defence"),
        70,
        "dragon warhammer should drain 30% of current Defence, rounded down",
    );
}

{
    const npc = createNpc({ defenceLevel: 1 });
    applicator.applySpecialEffects(attacker, npc, 1, { drainDefence: 0.3 }, 1);
    assert.equal(
        npc.getCombatStat("defence"),
        1,
        "a fractional drain below one level should round down to zero",
    );
}

{
    const npc = createNpc({ defenceLevel: 5 });
    applicator.applySpecialEffects(attacker, npc, 8, { drainDefenceByDamage: 1 }, 1);
    assert.equal(npc.getCombatStat("defence"), 0);
    assert.equal(
        npc.getCombatStat("strength"),
        1,
        "Bandos godsword should spill excess drain into the next combat stat",
    );
}

{
    const provider = createFallbackSpecialAttackProvider();
    const backstab = provider.get(8872);
    assert.equal(backstab?.effects?.drainDefenceOnlyByDamage, 1);
    assert.equal(backstab?.effects?.drainDefenceByDamage, undefined);

    const npc = createNpc({ defenceLevel: 5 });
    applicator.applySpecialEffects(attacker, npc, 8, backstab?.effects as FallbackSpecialAttackEffects, 1);
    assert.equal(npc.getCombatStat("defence"), 0);
    assert.equal(
        npc.getCombatStat("strength"),
        4,
        "bone dagger must not spill excess Defence drain into Strength",
    );

    npc.resetToSpawn();
    assert.equal(npc.getCombatStat("defence"), 5, "respawn should restore base combat levels");
}

console.log("combat stat drain regression test passed");
