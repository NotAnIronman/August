import assert from "node:assert/strict";

import { MultiCombatSystem } from "@server/game/combat/MultiCombatZones";
import { THEATRE_ROOMS, theatreRoomGeometry } from "@server/content/modules/theatre-of-blood/rooms";

const combat = new MultiCombatSystem();

assert.equal(combat.isMultiCombat(2875, 5355, 2), true, "Bandos room must be multi-combat");
assert.equal(combat.isMultiCombat(2875, 5355, 0), true, "God Wars ground plane remains multi");
assert.equal(
    combat.isMultiCombat(3200, 3700, 1),
    false,
    "ordinary Wilderness planes must not be broadened accidentally",
);

console.log("multi-combat zone tests passed");
for (let index=0;index<THEATRE_ROOMS.length;index++) {
    const {room,bounds}=theatreRoomGeometry(index);
    for(let x=bounds.minX;x<=bounds.maxX;x++)for(let y=bounds.minY;y<=bounds.maxY;y++) {
        assert.equal(combat.isMultiCombat(x,y,room.entrance.level),true,`${room.name} ${x},${y}: party combat must work throughout the room`);
    }
}
assert.equal(combat.isMultiCombat(3294,4247,1),false,"Nylo's unrelated upper floor stays unchanged");
assert.equal(combat.isMultiCombat(3169,4386,2),false,"Xarpus's unrelated upper floor stays unchanged");
