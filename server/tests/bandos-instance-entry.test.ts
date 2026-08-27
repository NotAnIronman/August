import assert from "node:assert/strict";

import { resolveLocActions } from "../../client/common/world/LocActionOverrides";
import type { IScriptRegistry, LocInteractionHandler } from "../src/game/scripts/types";
import { register } from "../extrascripts/bandos-instance";

assert.deepEqual(resolveLocActions(26503, ["Open", "Peek"]), [
    "Open",
    "Peek",
    "Enter Solo",
    "Enter Party",
    "Join Party",
]);
assert.deepEqual(resolveLocActions(1, ["Open"]), ["Open"]);

const handlers = new Map<string, LocInteractionHandler>();
const registry = {
    registerLocInteraction: (locId: number, handler: LocInteractionHandler, action?: string) => {
        handlers.set(`${locId}:${action}`, handler);
        return { unregister() {} };
    },
} as unknown as IScriptRegistry;
register(registry, {} as never);

assert.deepEqual([...handlers.keys()], [
    "26503:open",
    "26503:peek",
    "26503:enter solo",
    "26503:enter party",
    "26503:join party",
]);

console.log("bandos instance entry tests passed");
