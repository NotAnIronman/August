import assert from "node:assert/strict";
import { NpcEcs } from "@client/engine/game/ecs/NpcEcs";
const ecs = new NpcEcs();
const id = ecs.createNpc(51, 66, 8355, 4, 1000, 1000, 0, 0, 3294, 4247, 32);
ecs.setServerMapping(id, 99);
ecs.setInteractionIndex(id, 32769);
for (const type of [8356, 8357, 8355]) {
    ecs.setPresentationType(id, type, 4, 32);
    assert.equal(ecs.getNpcTypeId(id), type, "live dynamic geometry and menus see the morph, not only the worker instance");
    assert.equal(ecs.getServerId(id), 99);
    assert.equal(ecs.getX(id), 1000);
    assert.equal(ecs.getY(id), 1000);
}
console.log("Live NPC morph retains identity and position while switching all three Vasilias forms");
