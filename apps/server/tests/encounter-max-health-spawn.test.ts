import assert from "node:assert/strict";

import type { BasTypeLoader } from "@august/osrs-engine/config/bastype/BasTypeLoader";
import type { NpcType } from "@august/osrs-engine/config/npctype/NpcType";
import type { NpcTypeLoader } from "@august/osrs-engine/config/npctype/NpcTypeLoader";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterManager } from "@server/game/encounters/EncounterManager";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type { EncounterDefinition } from "@server/game/encounters/EncounterTypes";
import { NpcManager } from "@server/game/npcManager";
import type { PathService } from "@server/pathfinding/PathService";
import type { MapCollisionService } from "@server/world/MapCollisionService";

const NPC_TYPE_ID = 82_000;

function encounter(maxHealth: number): EncounterDefinition {
    return {
        id: `max-health-spawn-${maxHealth}`,
        npcTypeIds: [NPC_TYPE_ID],
        maxHealth,
        attacks: [
            {
                id: "melee",
                type: AttackType.Melee,
                rangeTiles: 1,
                speedTicks: 4,
            },
        ],
        phases: [
            { id: "normal", startsAtHealthPercent: 100 },
            { id: "wounded", startsAtHealthPercent: 50 },
        ],
    };
}

const validationRegistry = new EncounterRegistry();
assert.throws(() => validationRegistry.register(encounter(0)), /positive integer/);
assert.throws(() => validationRegistry.register(encounter(Number.NaN)), /positive integer/);

EncounterRegistry.shared.register(encounter(100));

const cacheNpcType = {
    id: NPC_TYPE_ID,
    name: "Encounter max-health override test",
    size: 1,
    rotationSpeed: 32,
    spawnDirection: 0,
    hitpoints: 255,
    combatLevel: 100,
    attackSpeed: 4,
    attackLevel: 100,
    strengthLevel: 100,
    defenceLevel: 100,
    magicLevel: 1,
    rangedLevel: 1,
    actions: ["Attack"],
    params: new Map(),
    getIdleSeqId: () => -1,
    getWalkSeqId: () => -1,
} as unknown as NpcType;

const npcManager = new NpcManager(
    {} as MapCollisionService,
    {
        findPathSteps: () => ({ ok: false, steps: [] }),
        getCollisionFlagAt: () => 0,
    } as unknown as PathService,
    { load: () => cacheNpcType } as unknown as NpcTypeLoader,
    {} as BasTypeLoader,
);
const encounterManager = new EncounterManager();
npcManager.setLifecycleHooks({
    onRemove: (npcId) => encounterManager.removeNpc(npcId),
    onReset: (npcId) => {
        const npc = npcManager.getById(npcId);
        assert.ok(npc);
        encounterManager.ensureForNpc(npc);
    },
});

const npc = npcManager.spawnTransientNpc({
    id: NPC_TYPE_ID,
    x: 3200,
    y: 3200,
    level: 0,
    wanderRadius: 0,
});
assert.ok(npc);
const runtime = encounterManager.getByNpcRuntimeId(npc.id);
assert.ok(runtime);

assert.equal(npc.getMaxHitpoints(), 100, "encounter metadata must override cache HP");
assert.equal(runtime.healthMax, 100);
npc.applyDamage(60);
assert.equal(npc.getHitpoints(), 40);
assert.equal(runtime.healthCurrent, 40);
assert.equal(runtime.phaseId, "wounded");
npc.applyDamage(40);
assert.equal(npc.getHitpoints(), 0);
assert.equal(runtime.healthCurrent, 0);
assert.equal(runtime.lifecycle, "dead");

console.log("encounter max-health spawn tests passed");
