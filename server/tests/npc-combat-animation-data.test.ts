import assert from "node:assert/strict";

import { shouldAdvanceNpcAnimationReviewCandidate } from "../gamemodes/vanilla/scripts/npcAnimationReview";
import type { ServerServices } from "../src/game/ServerServices";
import {
    assignNpcCombatAnimation,
    normalizeNpcAnimationPool,
    normalizeNpcLegacySpecialSlots,
    normalizeNpcSpecialName,
    pickNpcAnimationFromPool,
    type NpcCombatAnimationData,
} from "../src/game/npc/NpcCombatAnimationData";
import { CombatDataService } from "../src/game/services/CombatDataService";

function testBackwardCompatibleAssignments(): void {
    const animations: NpcCombatAnimationData = {
        attack: 422,
        melee: 100,
        // Duplicates are meaningful in the legacy positional format: removing
        // one would shift every subsequent `{ special: index }` reference.
        specials: [400, 400, 0],
    };

    assignNpcCombatAnimation(animations, { role: "melee", sequenceId: 101 });
    assignNpcCombatAnimation(animations, { role: "melee", sequenceId: 100 });
    assignNpcCombatAnimation(animations, { role: "attack", sequenceId: 101 });
    assignNpcCombatAnimation(animations, { role: "spawn", sequenceId: 200 });
    assignNpcCombatAnimation(animations, {
        role: "special",
        name: "Ground Slam",
        sequenceId: 300,
    });
    assignNpcCombatAnimation(animations, {
        role: "special",
        name: "ground-slam",
        sequenceId: 301,
    });
    assignNpcCombatAnimation(animations, { role: "special", sequenceId: 401 });

    assert.equal(animations.attack, 101, "Primary remains a singular explicit role");
    assert.deepEqual(animations.melee, [100, 101], "Repeated styles grow into a pool");
    assert.equal(animations.spawn, 200);
    assert.deepEqual(animations.namedSpecials?.["ground-slam"], [300, 301]);
    assert.deepEqual(
        animations.specials,
        [400, 400, 0, 401],
        "Legacy anonymous slot order, duplicates, and placeholders remain valid",
    );
}

function testNormalizationAndSelection(): void {
    assert.deepEqual(
        normalizeNpcAnimationPool([8, 8, -1, 0.5, 9.8, "10"]),
        [8, 9],
    );
    assert.equal(normalizeNpcSpecialName("  Fire Wall "), "fire-wall");
    assert.equal(normalizeNpcSpecialName("bad/name"), undefined);
    assert.throws(
        () => assignNpcCombatAnimation({}, { role: "special", name: "", sequenceId: 10 }),
        /Invalid NPC special animation name/,
    );
    assert.equal(pickNpcAnimationFromPool([10, 20, 30], 4), 20);
    assert.deepEqual(
        normalizeNpcLegacySpecialSlots([40, null, 0, 50, -1, "60"]),
        [40, 0, 0, 50, 0, 0],
        "legacy numeric special indices retain every placeholder slot",
    );
    assert.equal(shouldAdvanceNpcAnimationReviewCandidate("attack"), false);
    assert.equal(shouldAdvanceNpcAnimationReviewCandidate("melee"), true);
    assert.equal(shouldAdvanceNpcAnimationReviewCandidate("spawn"), true);
}

function testEncounterResolutionSupportsPoolsAndNames(): void {
    const combatData = new CombatDataService({} as ServerServices);
    Object.assign(combatData as unknown as Record<string, unknown>, {
        npcCombatDefs: {
            "9000": {
                attack: [10, 11],
                melee: [20, 21],
                spawn: 30,
                specials: [40],
                namedSpecials: { "ground-slam": [50, 51] },
            },
        },
        npcCombatDefaults: { attack: 422, block: 424, death: 836, deathSound: 512 },
    });

    assert.equal(combatData.resolveNpcEncounterAnimation(9000, "attack", 1), 11);
    assert.equal(combatData.resolveNpcEncounterAnimation(9000, "melee", 3), 21);
    assert.equal(combatData.resolveNpcEncounterAnimation(9000, "spawn"), 30);
    assert.equal(combatData.resolveNpcEncounterAnimation(9000, { special: 0 }, 99), 40);
    assert.equal(
        combatData.resolveNpcEncounterAnimation(9000, { special: "Ground Slam" }, 1),
        51,
    );
    assert.deepEqual(combatData.getNpcCombatAnimationPool(9000, "melee"), [20, 21]);
    assert.deepEqual(combatData.getNpcNamedSpecialAnimations(9000, "ground slam"), [50, 51]);
}

testBackwardCompatibleAssignments();
testNormalizationAndSelection();
testEncounterResolutionSupportsPoolsAndNames();

console.log("npc combat animation data tests passed");
