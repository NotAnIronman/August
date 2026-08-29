import assert from "node:assert/strict";

import type { ServerServices } from "@server/game/ServerServices";
import type { PlayerState } from "@server/game/player";
import { InstancedAreaManager } from "@server/world/InstancedAreaManager";

const lifecycle: string[] = [];
const owner = { id: 100, worldViewId: -1, instanceNpcIds: new Set<number>() } as PlayerState;
const member = { id: 101, worldViewId: -1, instanceNpcIds: new Set<number>() } as PlayerState;
const services = {
    mapService: { buildInstanceCollision: () => [] },
    pathService: {
        registerWorldViewCollision: (id: number) => lifecycle.push(`register:${id}`),
        removeWorldViewCollision: (id: number) => lifecycle.push(`remove:${id}`),
    },
    npcManager: {
        spawnTransientNpc: (spawn: { ownerPlayerId?: number }) => {
            assert.equal(spawn.ownerPlayerId, undefined);
            return { id: 701 };
        },
        removeNpc: (id: number) => {
            lifecycle.push(`npc:${id}`);
            return true;
        },
    },
    movementService: {
        teleportToInstance: (player: PlayerState) => lifecycle.push(`enter:${player.id}`),
        teleportPlayer: () => undefined,
    },
    locationService: {},
    scriptScheduler: { cancelOwner: () => 0 },
    groundItems: { removeByWorldView: (id: number) => lifecycle.push(`items:${id}`) },
} as unknown as ServerServices;

const instances = new InstancedAreaManager(services);
const party = instances.create(owner, {
    definitionId: "graardor-room",
    templateChunks: [],
    destination: { x: 2864, y: 5354, level: 2 },
    access: "party",
    maxPlayers: 2,
    joinInProgress: false,
    npcs: [{ id: 2215, offsetX: 10, offsetY: 10, level: 2 }],
});
assert(party);
assert.equal(instances.join(member, party.id)?.worldViewId, party.worldViewId);
assert.equal(instances.markStarted(party.id), true);
assert.equal(instances.leave(owner), true);
assert.equal(instances.get(member.id)?.ownerPlayerId, member.id);
assert(!lifecycle.includes(`remove:${party.worldViewId}`));
assert.equal(instances.leave(member), true);
assert.equal(instances.getById(party.id), undefined);
assert.deepEqual(lifecycle, [
    `register:${party.worldViewId}`,
    `enter:${owner.id}`,
    `enter:${member.id}`,
    "npc:701",
    `items:${party.worldViewId}`,
    `remove:${party.worldViewId}`,
]);

console.log("party instance lifecycle tests passed");
