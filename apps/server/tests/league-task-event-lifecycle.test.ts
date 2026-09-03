import assert from "node:assert/strict";

import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import { GameEventBus } from "@server/game/events/GameEventBus";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";
import type { ScriptServices } from "@server/game/scripts/types";
import { ScriptScheduler } from "@server/game/systems/ScriptScheduler";
import {
    type LeagueTaskEventSink,
    registerLeagueTaskEventHandlers,
} from "@server/content/gamemodes/leagues-v/scripts/leagueTaskEvents";

const eventBus = new GameEventBus();
const services = {
    hotReloadEnabled: true,
    system: { eventBus },
} as unknown as ScriptServices;
const runtime = new ScriptRuntime({
    registry: new ScriptRegistry(),
    scheduler: new ScriptScheduler(),
    services,
    logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
    },
});

const calls: string[] = [];
let sink: LeagueTaskEventSink | undefined = {
    onNpcKill: (playerId, npcTypeId, combatLevel) =>
        calls.push(`kill:${playerId}:${npcTypeId}:${combatLevel ?? "none"}`),
    onItemEquip: (playerId, itemId) => calls.push(`equip:${playerId}:${itemId}`),
    onItemCraft: (playerId, itemId, count) =>
        calls.push(`craft:${playerId}:${itemId}:${count}`),
};

const register = (): void => {
    runtime.registerHandlers("league-task-events", (registry) => {
        registerLeagueTaskEventHandlers(registry, eventBus, () => sink);
    });
};

register();
const player = { id: 17 } as PlayerState;
const npc = { id: 900, typeId: 901 } as NpcState;

eventBus.emit("npc:death", {
    npc,
    npcTypeId: 901,
    combatLevel: 123,
    killerPlayerId: undefined,
    tile: { x: 1, y: 2, level: 0 },
});
assert.deepEqual(calls, [], "unattributed kills must not progress a player's tasks");

eventBus.emit("npc:death", {
    npc,
    npcTypeId: 901,
    combatLevel: 123,
    killerPlayerId: player.id,
    tile: { x: 1, y: 2, level: 0 },
});
eventBus.emit("equipment:equip", { player, itemId: 4151, slot: 3 });
eventBus.emit("item:craft", { playerId: player.id, itemId: 1275, count: 2 });
assert.deepEqual(calls, ["kill:17:901:123", "equip:17:4151", "craft:17:1275:2"]);

const replacementCalls: string[] = [];
sink = {
    onNpcKill: (playerId, npcTypeId) => replacementCalls.push(`kill:${playerId}:${npcTypeId}`),
    onItemEquip: (playerId, itemId) => replacementCalls.push(`equip:${playerId}:${itemId}`),
    onItemCraft: (playerId, itemId, count) =>
        replacementCalls.push(`craft:${playerId}:${itemId}:${count}`),
};
register();

assert.equal(eventBus.listenerCount("npc:death"), 1);
assert.equal(eventBus.listenerCount("equipment:equip"), 1);
assert.equal(eventBus.listenerCount("item:craft"), 1);
eventBus.emit("equipment:equip", { player, itemId: 11802, slot: 3 });
assert.deepEqual(
    replacementCalls,
    ["equip:17:11802"],
    "hot reload must replace task listeners instead of invoking stale copies",
);

runtime.reset();
assert.equal(eventBus.listenerCount("npc:death"), 0);
assert.equal(eventBus.listenerCount("equipment:equip"), 0);
assert.equal(eventBus.listenerCount("item:craft"), 0);

console.log("league task event lifecycle regression test passed");
