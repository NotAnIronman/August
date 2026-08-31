import assert from "node:assert/strict";

import { register } from "@server/content/modules/nex-instance";
import type { IScriptRegistry, LocInteractionHandler } from "@server/game/scripts/types";

const handlers = new Map<string, LocInteractionHandler>();
const placements: unknown[][] = [];
const spawns: unknown[] = [];
const registry = {
    registerLocInteraction: (locId: number, handler: LocInteractionHandler, action?: string) => {
        handlers.set(`${locId}:${action}`, handler);
        return { unregister() {} };
    },
} as unknown as IScriptRegistry;
const services = {
    location: { replaceTemporaryLoc: (...args: unknown[]) => placements.push(args) },
    npc: { spawnNpc: (config: unknown) => { spawns.push(config); return undefined; } },
};

register(registry, services as never);

assert.equal(placements.length, 1);
assert.equal(placements[0]?.[2], 6084);
assert.deepEqual(placements[0]?.[3], { x: 2904, y: 5205 });
assert.deepEqual(spawns, [
    {
        id: 11289,
        x: 2904,
        y: 5206,
        level: 0,
        worldViewId: -1,
        wanderRadius: 0,
        isAggressive: false,
        isUnattackable: true,
        direction: 0,
    },
]);

const teleports: unknown[][] = [];
const player = { tileX: 2861, tileY: 5219 };
const interactionServices = {
    movement: { teleportPlayer: (...args: unknown[]) => teleports.push(args) },
};
handlers.get("42933:open")?.({ player, services: interactionServices } as never);
assert.deepEqual(teleports.at(-1), [player, 2863, 5219, 0]);

player.tileX = 2900;
player.tileY = 5203;
handlers.get("42934:open")?.({ player, services: interactionServices } as never);
assert.deepEqual(teleports.at(-1), [player, 2898, 5203, 0]);

for (const action of ["open", "peek", "enter solo", "enter party", "join party"]) {
    assert.ok(handlers.has(`42967:${action}`), `missing Ancient Barrier ${action} handler`);
}

console.log("nex instance entry tests passed");
