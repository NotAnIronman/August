import { hasPermission, type PlayerPermission } from "@server/network/PlayerPermission";
import {
    createCommandMetadata,
    type CommandMetadata,
    type CommandRegistrationMetadata,
} from "@server/game/commands/CommandMetadata";

const player = (owner: string, summary?: string): CommandRegistrationMetadata => ({
    permission: "player",
    owner,
    summary,
});

const developer = (
    owner: string,
    options: { hidden?: boolean; summary?: string } = {},
): CommandRegistrationMetadata => ({
    permission: "developer",
    owner,
    hidden: options.hidden,
    summary: options.summary,
});

/**
 * Commands implemented by the server's built-in chat-command adapter.
 * Content-owned commands register their own metadata with ScriptRegistry and
 * must not be duplicated here.
 */
const BUILTIN_COMMANDS: readonly CommandMetadata[] = [
    createCommandMetadata("pos", player("server:player-tools", "Show your current tile.")),
    createCommandMetadata("commands", player("server:command-system", "List available commands.")),
    createCommandMetadata("promote", developer("server:account-administration")),
    createCommandMetadata("demote", developer("server:account-administration")),
    createCommandMetadata("setdialogue", developer("developer:dialogue", { hidden: true })),
    createCommandMetadata("cleardialogue", developer("developer:dialogue", { hidden: true })),
    createCommandMetadata("runes", developer("developer:inventory")),
    createCommandMetadata("clear", developer("developer:inventory")),
    createCommandMetadata("devbank", developer("developer:banking")),
    createCommandMetadata("item", developer("developer:inventory")),
    createCommandMetadata("itemdata", developer("developer:item-diagnostics", { hidden: true })),
    createCommandMetadata("itemmodel", developer("developer:item-diagnostics")),
    createCommandMetadata("max", developer("developer:skills")),
    createCommandMetadata("gm", developer("developer:combat")),
    createCommandMetadata("insta", developer("developer:combat")),
    createCommandMetadata("maxhit", developer("developer:combat")),
    createCommandMetadata("quest", developer("developer:quests")),
    createCommandMetadata("reset", developer("developer:skills")),
    createCommandMetadata("spec", developer("developer:combat")),
    createCommandMetadata("spawn", developer("developer:teleport")),
    createCommandMetadata("spellbook", developer("developer:spellbook")),
    createCommandMetadata("tele", developer("developer:teleport")),
    createCommandMetadata("teleto", developer("developer:teleport")),
    createCommandMetadata("teletome", developer("developer:teleport")),
    createCommandMetadata("tickstats", developer("developer:diagnostics")),
];

const BUILTIN_BY_NAME = new Map(BUILTIN_COMMANDS.map((command) => [command.name, command]));

export function findBuiltinCommand(name: string): CommandMetadata | undefined {
    return BUILTIN_BY_NAME.get(name.trim().toLowerCase());
}

export function listBuiltinCommands(): readonly CommandMetadata[] {
    return BUILTIN_COMMANDS;
}

export function listBuiltinCommandsForPermission(
    permission: PlayerPermission,
): readonly CommandMetadata[] {
    return BUILTIN_COMMANDS.filter(
        (command) => !command.hidden && hasPermission(permission, command.permission),
    ).sort((left, right) => left.name.localeCompare(right.name));
}
