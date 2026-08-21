import { type PlayerPermission, hasPermission } from "../PlayerPermission";

/**
 * Chat-command access policy. This is checked before built-in and
 * script-registered command handlers are invoked.
 */
const BUILTIN_COMMAND_PERMISSIONS: Readonly<Record<string, PlayerPermission>> = {
    pos: "player",
    help: "player",
    commands: "player",
    promote: "developer",
    demote: "developer",
    setdialogue: "developer",
    cleardialogue: "developer",
    editdialogue: "developer",
    allrunes: "developer",
    ancient: "developer",
    arceuus: "developer",
    bond: "developer",
    clear: "developer",
    completequests: "developer",
    bank: "developer",
    devbank: "developer",
    item: "developer",
    itemspawner: "developer",
    kill: "developer",
    levelup: "developer",
    lunar: "developer",
    maxall: "developer",
    magic: "developer",
    onehealth: "developer",
    quest: "developer",
    randomitem: "developer",
    resetquests: "developer",
    rubytest: "developer",
    scroll: "developer",
    sail: "developer",
    unsail: "developer",
    spec: "developer",
    smithing: "developer",
    spawn: "developer",
    standard: "developer",
    tele: "developer",
    teleto: "developer",
    teletome: "developer",
    tickstats: "developer",
    whip: "developer",
};

export function getBuiltinChatCommandPermission(command: string): PlayerPermission | undefined {
    return BUILTIN_COMMAND_PERMISSIONS[command];
}

/**
 * All built-in commands available at or below a given permission level, sorted by
 * name. Used by ::help to show players only the commands they can actually run.
 * Extrascript-registered commands aren't included here since they aren't tracked
 * centrally — pass their own name/permission pairs in separately if needed.
 */
export function listBuiltinChatCommandsForPermission(
    playerPermission: PlayerPermission,
): Array<{ name: string; permission: PlayerPermission }> {
    return Object.entries(BUILTIN_COMMAND_PERMISSIONS)
        .filter(([, required]) => hasPermission(playerPermission, required))
        .map(([name, permission]) => ({ name, permission }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
