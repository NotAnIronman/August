import assert from "node:assert/strict";

import {
    HIT_CHANCE_SCALE,
    calculateFangHitChance,
    calculateHitChance,
} from "@server/game/combat/formulas/Accuracy";

function expectedFangChance(attack: number, defence: number): number {
    const probability =
        attack >= defence
            ? 1 - ((defence + 2) * (2 * defence + 3)) / (6 * (attack + 1) ** 2)
            : (attack * (4 * attack + 5)) / (6 * (attack + 1) * (defence + 1));
    return Math.round(probability * HIT_CHANCE_SCALE);
}

for (const [attack, defence] of [
    [20_000, 15_000],
    [15_000, 20_000],
    [15_000, 15_000],
] as const) {
    assert.equal(calculateFangHitChance(attack, defence), expectedFangChance(attack, defence));
}

const standard = calculateHitChance(15_000, 20_000) / HIT_CHANCE_SCALE;
const twoIndependentChecks = Math.round((1 - (1 - standard) ** 2) * HIT_CHANCE_SCALE);
assert.notEqual(calculateFangHitChance(15_000, 20_000), twoIndependentChecks);

console.log("fang accuracy tests passed");
