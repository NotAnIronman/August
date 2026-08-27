import assert from "node:assert/strict";

import { CombatEffectApplicator } from "../src/game/combat/CombatEffectApplicator";
import { HITMARK_DAMAGE } from "../src/game/combat/HitEffects";
import {
    isDeveloperGodmodeEnabled,
    setDeveloperGodmodeEnabled,
} from "../src/game/dev/DeveloperFlags";
import type { PlayerState } from "../src/game/player";

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

setDeveloperGodmodeEnabled(player, false);
assert.equal(isDeveloperGodmodeEnabled(player), false);
const ordinaryHit = applicator.applyPlayerHitsplat(player, HITMARK_DAMAGE, 17, 1, 25);
assert.equal(ordinaryHit.amount, 17);
assert.equal(ordinaryHit.hpCurrent, 33);
assert.equal(hitpoints, 33);

console.log("developer godmode tests passed");
