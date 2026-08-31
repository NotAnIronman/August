import type { PlayerPermission } from "@server/network/PlayerPermission";

/** Stable ownership and access contract for one chat command name. */
export interface CommandMetadata {
    readonly name: string;
    readonly permission: PlayerPermission;
    /** Domain responsible for behavior, tests, and eventual removal. */
    readonly owner: string;
    /** Hidden commands remain callable but are omitted from ::help/::commands. */
    readonly hidden: boolean;
    readonly summary?: string;
}

export type CommandRegistrationMetadata = Omit<CommandMetadata, "name" | "hidden"> & {
    readonly hidden?: boolean;
};

export interface RegisteredCommand<THandler> {
    readonly metadata: CommandMetadata;
    readonly handler: THandler;
}

export function normalizeCommandName(name: string): string {
    const normalized = name.trim().toLowerCase();
    if (!normalized) throw new Error("Command names must not be empty.");
    if (!/^[a-z0-9_-]+$/.test(normalized)) {
        throw new Error(`Invalid command name: ${name}`);
    }
    return normalized;
}

export function createCommandMetadata(
    name: string,
    metadata: CommandRegistrationMetadata,
): CommandMetadata {
    const owner = metadata.owner.trim();
    if (!owner) throw new Error(`Command ${name} requires an owner.`);
    return Object.freeze({
        name: normalizeCommandName(name),
        permission: metadata.permission,
        owner,
        hidden: metadata.hidden ?? false,
        ...(metadata.summary?.trim() ? { summary: metadata.summary.trim() } : {}),
    });
}
