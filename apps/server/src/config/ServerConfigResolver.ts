import { GAMEMODE_ID_REQUIREMENT, isValidGamemodeId } from "@server/config/GamemodeId";

export interface WorldConfig {
    id: number;
    name: string;
    gamemode: string;
    port: number;
}

export interface ServerConfig {
    host: string;
    port: number;
    tickMs: number;
    serverName: string;
    maxPlayers: number;
    worlds: WorldConfig[];
}

export type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export interface ResolveServerConfigOptions {
    readonly fileConfig?: unknown;
    readonly environment?: ServerEnvironment;
    readonly argv?: readonly string[];
}

export interface ResolvedServerConfig {
    readonly activeWorld: WorldConfig;
    readonly config: ServerConfig;
}

export const MIN_SERVER_PORT = 1;
export const MAX_SERVER_PORT = 65_535;
export const DEFAULT_SERVER_TICK_MS = 600;
// Node converts timer delays above a signed 32-bit integer to 1 ms.
export const MAX_SERVER_TICK_MS = 2_147_483_647;
// Player synchronization has 2,048 indices, with index 0 reserved.
export const MAX_SERVER_PLAYERS = 2_047;

const DEFAULT_HOST = "::";
const DEFAULT_MAX_PLAYERS = MAX_SERVER_PLAYERS;
const DECIMAL_INTEGER_PATTERN = /^\d+$/;

const DEFAULT_WORLDS: readonly WorldConfig[] = [
    {
        id: 1,
        name: "Vanilla",
        gamemode: "vanilla",
        port: 43_594,
    },
    {
        id: 2,
        name: "Leagues V",
        gamemode: "leagues-v",
        port: 43_595,
    },
];

export class ServerConfigurationError extends Error {
    constructor(message: string) {
        super(`Invalid server configuration: ${message}`);
        this.name = "ServerConfigurationError";
    }
}

function describe(value: unknown): string {
    if (typeof value === "number" && !Number.isFinite(value)) return String(value);
    return JSON.stringify(value) ?? String(value);
}

function fail(message: string): never {
    throw new ServerConfigurationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(source, key);
}

function requireNonEmptyString(value: unknown, label: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
        return fail(`${label} must be a non-empty string; received ${describe(value)}.`);
    }
    return value.trim();
}

function requireGamemodeId(value: unknown, label: string): string {
    const id = requireNonEmptyString(value, label);
    if (!isValidGamemodeId(id)) {
        return fail(`${label} must use ${GAMEMODE_ID_REQUIREMENT}; received ${describe(value)}.`);
    }
    return id;
}

function requireIntegerInRange(
    value: unknown,
    label: string,
    minimum: number,
    maximum: number,
): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < minimum ||
        value > maximum
    ) {
        return fail(
            `${label} must be an integer from ${minimum} to ${maximum}; received ${describe(value)}.`,
        );
    }
    return value;
}

function readOptionalConfigString(
    source: Record<string, unknown>,
    key: string,
): string | undefined {
    if (!hasOwn(source, key)) return undefined;
    return requireNonEmptyString(source[key], `config.json ${key}`);
}

function resolveWorlds(fileConfig: Record<string, unknown>): WorldConfig[] {
    if (!hasOwn(fileConfig, "worlds")) {
        return DEFAULT_WORLDS.map((world) => ({ ...world }));
    }

    const rawWorlds = fileConfig.worlds;
    if (!Array.isArray(rawWorlds)) {
        return fail(`config.json worlds must be an array; received ${describe(rawWorlds)}.`);
    }
    if (rawWorlds.length === 0) {
        return fail("config.json worlds must contain at least one world.");
    }

    const worlds = rawWorlds.map((rawWorld, index): WorldConfig => {
        const label = `config.json worlds[${index}]`;
        if (!isRecord(rawWorld)) {
            return fail(`${label} must be an object; received ${describe(rawWorld)}.`);
        }

        for (const key of ["id", "name", "gamemode", "port"] as const) {
            if (!hasOwn(rawWorld, key)) {
                return fail(`${label}.${key} is required.`);
            }
        }

        return {
            id: requireIntegerInRange(rawWorld.id, `${label}.id`, 1, Number.MAX_SAFE_INTEGER),
            name: requireNonEmptyString(rawWorld.name, `${label}.name`),
            gamemode: requireGamemodeId(rawWorld.gamemode, `${label}.gamemode`),
            port: requireIntegerInRange(
                rawWorld.port,
                `${label}.port`,
                MIN_SERVER_PORT,
                MAX_SERVER_PORT,
            ),
        };
    });

    const idIndexes = new Map<number, number>();
    const portIndexes = new Map<number, number>();
    for (const [index, world] of worlds.entries()) {
        const duplicateIdIndex = idIndexes.get(world.id);
        if (duplicateIdIndex !== undefined) {
            return fail(
                `config.json worlds[${index}].id duplicates worlds[${duplicateIdIndex}].id (${world.id}).`,
            );
        }
        idIndexes.set(world.id, index);

        const duplicatePortIndex = portIndexes.get(world.port);
        if (duplicatePortIndex !== undefined) {
            return fail(
                `config.json worlds[${index}].port duplicates worlds[${duplicatePortIndex}].port (${world.port}).`,
            );
        }
        portIndexes.set(world.port, index);
    }

    return worlds;
}

function readOptionalEnvironmentText(
    environment: ServerEnvironment,
    name: string,
): string | undefined {
    const raw = environment[name];
    if (raw === undefined) return undefined;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function parseEnvironmentInteger(
    raw: string,
    label: string,
    minimum: number,
    maximum: number,
): number {
    if (!DECIMAL_INTEGER_PATTERN.test(raw)) {
        return fail(
            `${label} must be a base-10 integer from ${minimum} to ${maximum}; received ${describe(raw)}.`,
        );
    }

    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        return fail(
            `${label} must be an integer from ${minimum} to ${maximum}; received ${describe(raw)}.`,
        );
    }
    return parsed;
}

function resolveSelectedWorld(
    worlds: readonly WorldConfig[],
    environment: ServerEnvironment,
    argv: readonly string[],
): WorldConfig {
    const worldIdEnv = readOptionalEnvironmentText(environment, "WORLD_ID");
    const worldArg = argv.find((value) => value.startsWith("--world="));

    let selector: string | undefined;
    let selectorName: "WORLD_ID" | "--world" | undefined;
    if (worldIdEnv !== undefined) {
        selector = worldIdEnv;
        selectorName = "WORLD_ID";
    } else if (worldArg !== undefined) {
        selector = worldArg.slice("--world=".length).trim();
        selectorName = "--world";
    }

    const selectedWorldId =
        selectorName === undefined
            ? worlds[0].id
            : parseEnvironmentInteger(
                  selector ?? "",
                  selectorName,
                  1,
                  Number.MAX_SAFE_INTEGER,
              );
    const activeWorld = worlds.find((world) => world.id === selectedWorldId);
    if (!activeWorld) {
        return fail(
            `${selectorName ?? "world selection"} references unknown world ID ${selectedWorldId}; ` +
                `configured world IDs are ${worlds.map((world) => world.id).join(", ")}.`,
        );
    }
    return activeWorld;
}

export function parseServerConfigJson(raw: string, source = "config.json"): unknown {
    try {
        return JSON.parse(raw) as unknown;
    } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        return fail(`${source} contains invalid JSON.${detail}`);
    }
}

export function resolveServerConfig(
    options: ResolveServerConfigOptions = {},
): ResolvedServerConfig {
    const environment = options.environment ?? {};
    const argv = options.argv ?? [];
    const rawFileConfig = options.fileConfig;
    if (rawFileConfig !== undefined && !isRecord(rawFileConfig)) {
        return fail(`config.json must contain a JSON object; received ${describe(rawFileConfig)}.`);
    }
    const fileConfig = rawFileConfig ?? {};

    const configuredHost = readOptionalConfigString(fileConfig, "host") ?? DEFAULT_HOST;
    // serverName remains a recognized field for compatibility, although active
    // world names are the default advertised names when SERVER_NAME is unset.
    readOptionalConfigString(fileConfig, "serverName");
    const maxPlayers = hasOwn(fileConfig, "maxPlayers")
        ? requireIntegerInRange(
              fileConfig.maxPlayers,
              "config.json maxPlayers",
              1,
              MAX_SERVER_PLAYERS,
          )
        : DEFAULT_MAX_PLAYERS;
    const worlds = resolveWorlds(fileConfig);
    const activeWorld = resolveSelectedWorld(worlds, environment, argv);

    const host = readOptionalEnvironmentText(environment, "HOST") ?? configuredHost;
    const portText = readOptionalEnvironmentText(environment, "PORT");
    const tickMsText = readOptionalEnvironmentText(environment, "TICK_MS");
    const serverName =
        readOptionalEnvironmentText(environment, "SERVER_NAME") ?? activeWorld.name;

    return {
        activeWorld,
        config: {
            // `::` accepts public IPv6 traffic and, on normal dual-stack systems, IPv4 too.
            // Set HOST=0.0.0.0 if the machine is intentionally IPv4-only.
            host,
            port:
                portText === undefined
                    ? activeWorld.port
                    : parseEnvironmentInteger(
                          portText,
                          "PORT",
                          MIN_SERVER_PORT,
                          MAX_SERVER_PORT,
                      ),
            tickMs:
                tickMsText === undefined
                    ? DEFAULT_SERVER_TICK_MS
                    : parseEnvironmentInteger(
                          tickMsText,
                          "TICK_MS",
                          1,
                          MAX_SERVER_TICK_MS,
                      ),
            serverName,
            maxPlayers,
            worlds,
        },
    };
}
