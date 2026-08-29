import assert from "node:assert/strict";

import { MultiCombatSystem } from "@server/game/combat/MultiCombatZones";

const combat = new MultiCombatSystem();

assert.equal(combat.isMultiCombat(2875, 5355, 2), true, "Bandos room must be multi-combat");
assert.equal(combat.isMultiCombat(2875, 5355, 0), true, "God Wars ground plane remains multi");
assert.equal(
    combat.isMultiCombat(3200, 3700, 1),
    false,
    "ordinary Wilderness planes must not be broadened accidentally",
);

console.log("multi-combat zone tests passed");
