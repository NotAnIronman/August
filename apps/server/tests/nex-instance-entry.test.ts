import assert from "node:assert/strict";

import { register } from "@server/content/modules/nex-instance";
import type { IScriptRegistry, LocInteractionHandler } from "@server/game/scripts/types";

const handlers = new Map<string, LocInteractionHandler>();
const removals: unknown[][] = [];
const spawns: unknown[] = [];
const registry = {
    registerLocInteraction: (locId: number, handler: LocInteractionHandler, action?: string) => {
        handlers.set(`${locId}:${action}`, handler);
        return { unregister() {} };
    },
} as unknown as IScriptRegistry;
const services = {
    location: { removeTemporaryLoc: (...args: unknown[]) => removals.push(args) },
    npc: { spawnNpc: (config: unknown) => { spawns.push(config); return undefined; } },
};

register(registry, services as never);

assert.deepEqual(removals, [
    [{ worldViewId: -1 }, 6084, { x: 2904, y: 5205 }, 0, { oldShape: 10, newShape: 10 }],
]);
assert.deepEqual(spawns[0], {
    id: 11289,
    x: 2904,
    y: 5205,
    level: 0,
    worldViewId: -1,
    wanderRadius: 0,
    isAggressive: false,
    isUnattackable: true,
    direction: 0,
});
assert.deepEqual(
    [11293, 11290, 11291, 11292].map((id) => spawns.filter((spawn) => (spawn as { id: number }).id === id).length),
    [12, 9, 5, 5],
    "the Ancient Prison should contain its complete Blood Reaver and spiritual-creature population",
);

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

for (const action of ["pass", "pass (normal)", "pass (private)", "peek", "enter solo", "enter party", "join party"]) {
    assert.ok(handlers.has(`42967:${action}`), `missing Ancient Barrier ${action} handler`);
}
assert.ok(handlers.has("42937:pass"), "missing live Ancient Barrier pass handler");
assert.ok(handlers.has("42965:pray"), "missing Nex altar handler");

console.log("nex instance entry tests passed");
