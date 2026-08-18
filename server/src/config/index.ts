import { readFileSync } from "fs";
import { resolve } from "path";

import { logger } from "../utils/logger";

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

const portEnv = process.env.PORT?.trim();
const tickMsEnv = process.env.TICK_MS?.trim();

let host = "::";
let serverName = "Local Development";
let maxPlayers = 2047;

let worlds: WorldConfig[] = [
    {
        id: 1,
        name: "Vanilla",
        gamemode: "vanilla",
        port: 43594,
    },
    {
        id: 2,
        name: "Leagues V",
        gamemode: "leagues-v",
        port: 43595,
    },
];

try {
    const raw = readFileSync(resolve(__dirname, "../../config.json"), "utf-8");
    const parsed = JSON.parse(raw);

    if (typeof parsed.serverName === "string") {
        serverName = parsed.serverName;
    }

    if (typeof parsed.host === "string" && parsed.host.trim()) {
        host = parsed.host.trim();
    }

    if (typeof parsed.maxPlayers === "number") {
        maxPlayers = parsed.maxPlayers;
    }

    if (Array.isArray(parsed.worlds)) {
        worlds = parsed.worlds.map((world: Partial<WorldConfig>, index: number) => ({
            id: typeof world.id === "number" ? world.id : index + 1,
            name: typeof world.name === "string" ? world.name : `World ${index + 1}`,
            gamemode: typeof world.gamemode === "string" ? world.gamemode : "vanilla",
            port:
                typeof world.port === "number" && world.port > 0
                    ? world.port
                    : 43594 + index,
        }));
    }
} catch (err) {
    logger.info("[config] failed to load config.json", err);
}

function getWorldIdFromArgs(): number | undefined {
    const arg = process.argv.find((value) => value.startsWith("--world="));
    const raw = process.env.WORLD_ID?.trim() ?? arg?.slice("--world=".length);
    if (!raw) return undefined;
    const id = Number(raw);
    return Number.isInteger(id) ? id : undefined;
}

const selectedWorldId = getWorldIdFromArgs() ?? worlds[0]?.id;
export const activeWorld = worlds.find((world) => world.id === selectedWorldId);

if (!activeWorld) {
    throw new Error(`Unknown world ID ${selectedWorldId}. Configure it in server/config.json.`);
}

export const config: ServerConfig = {
    // `::` accepts public IPv6 traffic and, on normal dual-stack systems, IPv4 too.
    // Set HOST=0.0.0.0 if the machine is intentionally IPv4-only.
    host: process.env.HOST || host,
    port: portEnv ? parseInt(portEnv, 10) || activeWorld.port : activeWorld.port,
    tickMs: tickMsEnv ? parseInt(tickMsEnv, 10) || 600 : 600,
    serverName: process.env.SERVER_NAME?.trim() || `World ${activeWorld.id} - ${activeWorld.name}`,
    maxPlayers,
    worlds,
};
