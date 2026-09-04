import assert from "node:assert/strict";

import type { WebSocket } from "ws";

import { DEBUG_PLAYER_IDS } from "@server/game/actor";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import type { GamemodeDefinition } from "@server/game/gamemodes/GamemodeDefinition";
import { LockState } from "@server/game/model/LockState";
import { PlayerManager } from "@server/game/PlayerManager";
import type { PathService } from "@server/pathfinding/PathService";

const gamemode = {
    initializePlayer: () => undefined,
} as unknown as GamemodeDefinition;

registerSkillConfiguration({
    computeCombatLevel: () => 3,
    skillRestoreIntervalTicks: 100,
    skillBoostDecayIntervalTicks: 100,
    hitpointRegenIntervalTicks: 100,
    hitpointOverhealDecayIntervalTicks: 100,
    preserveDecayMultiplier: 1.5,
});

const pathService = {
    findPathSteps: () => ({ ok: true, steps: [] }),
    getGraphSize: () => 128,
} as unknown as PathService;

function socket(): WebSocket {
    return {} as WebSocket;
}

const manager = new PlayerManager(
    gamemode,
    pathService,
    undefined,
    undefined,
    undefined,
    { debugHumanPathfinding: true },
);

const firstSocket = socket();
const first = manager.add(firstSocket, 3200, 3200);
assert.ok(first);
assert.equal(manager.setConnectedPlayerName(firstSocket, "First"), true);
assert.equal(manager.getById(first.id), first);
assert.equal(manager.getPlayerById(first.id), first);
assert.equal(manager.getSocketByPlayerId(first.id), firstSocket);
assert.equal(manager.hasConnectedPlayer(" first "), true);
assert.equal(manager.getConnectedPlayerByName("FIRST"), first);
const duplicateSocket = socket();
const duplicate = manager.add(duplicateSocket, 3202, 3200);
assert.ok(duplicate);
assert.equal(manager.setConnectedPlayerName(duplicateSocket, "FIRST"), false);
assert.equal(duplicate.name, "");
manager.remove(duplicateSocket);
assert.equal(DEBUG_PLAYER_IDS.has(first.id), true);

// Re-registering the same transport must not leak another player ID.
assert.equal(manager.add(firstSocket, 3300, 3300), first);
assert.equal(manager.getRealPlayerCount(), 1);

const bot = manager.addBot(3201, 3200);
assert.ok(bot);
assert.equal(manager.getById(bot.id), bot);
assert.equal(manager.getSocketByPlayerId(bot.id), undefined);

// Orphaning moves transport ownership but keeps the canonical ID index alive.
first.lock = LockState.FULL;
assert.equal(manager.orphanPlayer(firstSocket, "first", 10), true);
assert.equal(manager.getById(first.id), first);
assert.equal(manager.getRealPlayerCount(), 1);
assert.equal(manager.getSocketByPlayerId(first.id), undefined);
assert.equal(manager.hasConnectedPlayer("first"), false);

const replacementSocket = socket();
assert.equal(manager.reconnectOrphanedPlayer(replacementSocket, "first"), first);
assert.equal(manager.getById(first.id), first);
assert.equal(manager.getSocketByPlayerId(first.id), replacementSocket);
assert.equal(manager.getConnectedPlayerByName("first"), first);

manager.remove(replacementSocket);
assert.equal(manager.getById(first.id), undefined);
assert.equal(manager.getSocketByPlayerId(first.id), undefined);
assert.equal(manager.hasConnectedPlayer("first"), false);
assert.equal(DEBUG_PLAYER_IDS.has(first.id), false);

// Released IDs are reusable and the index must point only to the new owner.
const reused = manager.add(socket(), 3400, 3400);
assert.ok(reused);
assert.equal(reused.id, first.id);
assert.equal(manager.getById(reused.id), reused);
assert.notEqual(manager.getById(reused.id), first);

console.log("player manager canonical index regression test passed");
