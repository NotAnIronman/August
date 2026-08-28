import assert from "node:assert/strict";

import { CombatEffectApplicator } from "../src/game/combat/CombatEffectApplicator";
import { HITMARK_DAMAGE } from "../src/game/combat/HitEffects";
import { CombatAttributeStore } from "../src/game/combat/state/CombatAttributeStore";
import {
    isDeveloperGodmodeEnabled,
    setDeveloperGodmodeEnabled,
} from "../src/game/dev/DeveloperFlags";
import type { PlayerState } from "../src/game/player";
import { PlayerCombatState } from "../src/game/state/PlayerCombatState";
import { PlayerRunEnergyState } from "../src/game/state/PlayerRunEnergyState";
import { PlayerSpecialEnergyState } from "../src/game/state/PlayerSpecialEnergyState";

let hitpoints = 50;
const player = {
    gamemodeState: new Map<string, unknown>(),
    skillSystem: {
        getHitpointsCurrent: () => hitpoints,
        getHitpointsMax: () => 60,
        applyHitpointsDamage: (amount: number) => {
            hitpoints = Math.max(0, hitpoints - amount);
        },
    },
} as unknown as PlayerState;

const applicator = new CombatEffectApplicator();
setDeveloperGodmodeEnabled(player, true);
assert.equal(isDeveloperGodmodeEnabled(player), true);

const protectedHit = applicator.applyPlayerHitsplat(player, HITMARK_DAMAGE, 17, 0, 25);
assert.equal(protectedHit.amount, 17);
assert.equal(protectedHit.hpCurrent, 50);
assert.equal(hitpoints, 50);

const runOwner = { runEnergy: 2500, runToggle: true };
const runEnergy = new PlayerRunEnergyState(runOwner, () => isDeveloperGodmodeEnabled(player));
assert.equal(runEnergy.adjustRunEnergyUnits(-1000), 10_000);
assert.equal(runEnergy.getRunEnergyPercent(), 100);

const combatState = new PlayerCombatState();
const combatAttributes = new CombatAttributeStore();
const specialEnergy = new PlayerSpecialEnergyState(
    combatState,
    combatAttributes,
    () => isDeveloperGodmodeEnabled(player),
);
specialEnergy.setPercent(100);
assert.equal(specialEnergy.consume(50), true);
assert.equal(specialEnergy.getPercent(), 100);

setDeveloperGodmodeEnabled(player, false);
assert.equal(isDeveloperGodmodeEnabled(player), false);
const ordinaryHit = applicator.applyPlayerHitsplat(player, HITMARK_DAMAGE, 17, 1, 25);
assert.equal(ordinaryHit.amount, 17);
assert.equal(ordinaryHit.hpCurrent, 33);
assert.equal(hitpoints, 33);

console.log("developer godmode tests passed");
