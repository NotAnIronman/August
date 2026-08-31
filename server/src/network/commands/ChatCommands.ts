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
    dev: "developer",
    setdialogue: "developer",
    cleardialogue: "developer",
    editdialogue: "developer",
    dsel: "developer",
    dline: "developer",
    doption: "developer",
    dcond: "developer",
    daction: "developer",
    ddelete: "developer",
    ddeletebranch: "developer",
    dnest: "developer",
    dtext: "developer",
    dspeaker: "developer",
    allrunes: "developer",
    ancient: "developer",
    arceuus: "developer",
    bond: "developer",
    clear: "developer",
    completequests: "developer",
    bank: "developer",
    devbank: "developer",
    item: "developer",
    itemdata: "developer",
    itemmodel: "developer",
    itemspawner: "developer",
    kill: "developer",
    levelup: "developer",
    lunar: "developer",
    maxall: "developer",
    magic: "developer",
    godmode: "developer",
    instakill: "developer",
    onehealth: "developer",
    quest: "developer",
    randomitem: "developer",
    resetstats: "developer",
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

// The dialogue editor and similar interface plumbing are intentionally
// callable for development and automation, but listing them in ::commands
// makes the player-facing command reference unreadable.
const HIDDEN_FROM_COMMAND_LIST = new Set([
    "setdialogue",
    "cleardialogue",
    "editdialogue",
    "dsel",
    "dline",
    "doption",
    "dcond",
    "daction",
    "ddelete",
    "ddeletebranch",
    "dnest",
    "dtext",
    "dspeaker",
    "itemdata",
]);

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
        .filter(
            ([name, required]) =>
                hasPermission(playerPermission, required) && !HIDDEN_FROM_COMMAND_LIST.has(name),
        )
        .map(([name, permission]) => ({ name, permission }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
