import assert from "node:assert/strict";

import {
    findBuiltinCommand,
    listBuiltinCommands,
} from "@server/game/commands/BuiltinCommandCatalog";
import {
    listAvailableCommands,
    resolveCommand,
} from "@server/game/commands/CommandDispatch";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import type { CommandHandler } from "@server/game/scripts/types";

const registry = new ScriptRegistry();
const hiddenDeveloperHandler: CommandHandler = () => "developer";
const playerHandler: CommandHandler = () => "player";

const hiddenRegistration = registry.registerCommand(
    " MixedCase ",
    hiddenDeveloperHandler,
    {
        permission: "developer",
        owner: "content:test:diagnostics",
        hidden: true,
    },
);
registry.registerCommand("contenthelp", playerHandler, {
    permission: "player",
    owner: "content:test",
    summary: "Visible content command.",
});

assert.equal(registry.findCommand("MIXEDCASE"), hiddenDeveloperHandler);
assert.deepEqual(registry.findCommandRegistration("mixedcase")?.metadata, {
    name: "mixedcase",
    permission: "developer",
    owner: "content:test:diagnostics",
    hidden: true,
});
assert.deepEqual(
    registry.listCommands().map((command) => command.name),
    ["contenthelp", "mixedcase"],
);

const resolvedContent = resolveCommand(
    "mixedcase",
    registry.findCommandRegistration("mixedcase"),
);
assert.equal(resolvedContent?.source, "content");
assert.equal(
    resolvedContent?.source === "content" ? resolvedContent.handler : undefined,
    hiddenDeveloperHandler,
);

const collidingRegistry = new ScriptRegistry();
collidingRegistry.registerCommand("help", playerHandler, {
    permission: "developer",
    owner: "content:test:collision",
});
assert.equal(
    resolveCommand("help", collidingRegistry.findCommandRegistration("help"))?.source,
    "builtin",
    "built-in commands must win dispatch collisions deterministically",
);

const playerVisible = listAvailableCommands("player", registry.listCommands()).map(
    (command) => command.name,
);
assert(playerVisible.includes("help"));
assert(playerVisible.includes("contenthelp"));
assert(!playerVisible.includes("mixedcase"));

const developerVisible = listAvailableCommands("developer", registry.listCommands()).map(
    (command) => command.name,
);
assert(developerVisible.includes("contenthelp"));
assert(!developerVisible.includes("mixedcase"), "hidden commands must stay out of discovery");

assert.equal(findBuiltinCommand("HELP")?.permission, "player");
assert.equal(findBuiltinCommand("tele")?.permission, "developer");
assert(listBuiltinCommands().every((command) => command.owner.length > 0));

const replacementRegistry = new ScriptRegistry();
const first: CommandHandler = () => "first";
const second: CommandHandler = () => "second";
const firstRegistration = replacementRegistry.registerCommand("replace", first, {
    permission: "player",
    owner: "content:test:first",
});
replacementRegistry.registerCommand("replace", second, {
    permission: "player",
    owner: "content:test:second",
});
firstRegistration.unregister();
assert.equal(
    replacementRegistry.findCommand("replace"),
    second,
    "unregistering an overwritten command must not remove its replacement",
);

hiddenRegistration.unregister();
assert.equal(registry.findCommand("mixedcase"), undefined);

assert.throws(
    () => registry.registerCommand("bad command", playerHandler, {
        permission: "player",
        owner: "content:test",
    }),
    /Invalid command name/,
);
assert.throws(
    () => registry.registerCommand("ownerless", playerHandler, {
        permission: "player",
        owner: "   ",
    }),
    /requires an owner/,
);

console.log("command registry metadata and dispatch tests passed");
