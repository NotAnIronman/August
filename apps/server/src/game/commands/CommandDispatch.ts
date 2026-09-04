import { findBuiltinCommand, listBuiltinCommands } from "@server/game/commands/BuiltinCommandCatalog";
import type {
    CommandMetadata,
    RegisteredCommand,
} from "@server/game/commands/CommandMetadata";
import { hasPermission, type PlayerPermission } from "@server/network/PlayerPermission";

export type ResolvedCommand<THandler> =
    | { readonly source: "builtin"; readonly metadata: CommandMetadata }
    | {
          readonly source: "content";
          readonly metadata: CommandMetadata;
          readonly handler: THandler;
      };

/**
 * The single command-name dispatch boundary. Transport code parses chat once,
 * then resolves through this function before checking permission or invoking a
 * built-in/content handler. Built-ins deliberately win name collisions.
 */
export function resolveCommand<THandler>(
    name: string,
    registered?: RegisteredCommand<THandler>,
): ResolvedCommand<THandler> | undefined {
    const builtin = findBuiltinCommand(name);
    if (builtin) return { source: "builtin", metadata: builtin };
    if (!registered) return undefined;
    return {
        source: "content",
        metadata: registered.metadata,
        handler: registered.handler,
    };
}

/** Discoverable, permission-filtered command catalog used by ::commands. */
export function listAvailableCommands(
    permission: PlayerPermission,
    registered: readonly CommandMetadata[],
): readonly CommandMetadata[] {
    const byName = new Map<string, CommandMetadata>();
    for (const command of [...listBuiltinCommands(), ...registered]) {
        if (command.hidden || !hasPermission(permission, command.permission)) continue;
        if (!byName.has(command.name)) byName.set(command.name, command);
    }
    return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}
