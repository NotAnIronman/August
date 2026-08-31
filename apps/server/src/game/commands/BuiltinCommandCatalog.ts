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
    createCommandMetadata("help", player("server:command-system", "List available commands.")),
    createCommandMetadata("commands", player("server:command-system", "List available commands.")),
    createCommandMetadata("promote", developer("server:account-administration")),
    createCommandMetadata("demote", developer("server:account-administration")),
    createCommandMetadata("setdialogue", developer("developer:dialogue", { hidden: true })),
    createCommandMetadata("cleardialogue", developer("developer:dialogue", { hidden: true })),
    createCommandMetadata("allrunes", developer("developer:inventory")),
    createCommandMetadata("ancient", developer("developer:spellbook")),
    createCommandMetadata("arceuus", developer("developer:spellbook")),
    createCommandMetadata("bond", developer("developer:inventory")),
    createCommandMetadata("clear", developer("developer:inventory")),
    createCommandMetadata("bank", developer("developer:banking")),
    createCommandMetadata("devbank", developer("developer:banking")),
    createCommandMetadata("item", developer("developer:inventory")),
    createCommandMetadata("itemdata", developer("developer:item-diagnostics", { hidden: true })),
    createCommandMetadata("itemmodel", developer("developer:item-diagnostics")),
    createCommandMetadata("kill", developer("developer:combat")),
    createCommandMetadata("levelup", developer("developer:skills")),
    createCommandMetadata("lunar", developer("developer:spellbook")),
    createCommandMetadata("maxall", developer("developer:skills")),
    createCommandMetadata("godmode", developer("developer:combat")),
    createCommandMetadata("instakill", developer("developer:combat")),
    createCommandMetadata("onehealth", developer("developer:combat")),
    createCommandMetadata("quest", developer("developer:quests")),
    createCommandMetadata("randomitem", developer("developer:inventory")),
    createCommandMetadata("resetstats", developer("developer:skills")),
    createCommandMetadata("rubytest", developer("developer:magic-testing")),
    createCommandMetadata("scroll", developer("developer:ui-testing")),
    createCommandMetadata("spec", developer("developer:combat")),
    createCommandMetadata("smithing", developer("developer:skills")),
    createCommandMetadata("spawn", developer("developer:teleport")),
    createCommandMetadata("standard", developer("developer:spellbook")),
    createCommandMetadata("tele", developer("developer:teleport")),
    createCommandMetadata("teleto", developer("developer:teleport")),
    createCommandMetadata("teletome", developer("developer:teleport")),
    createCommandMetadata("tickstats", developer("developer:diagnostics")),
    createCommandMetadata("whip", developer("developer:inventory")),
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
