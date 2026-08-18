import { readFileSync } from "fs";
import { resolve } from "path";

import { logger } from "../utils/logger";

export interface WorldConfig {
    id: number;
    name: string;
    gamemode: string;
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

let serverName = "Local Development";
let maxPlayers = 2047;

let worlds: WorldConfig[] = [
    {
        id: 1,
        name: "Vanilla",
        gamemode: "vanilla",
    },
{
    id: 2,
    name: "Raging Echoes",
    gamemode: "leagues-v",
},
];

try {
    const raw = readFileSync(resolve(__dirname, "../../config.json"), "utf-8");
    const parsed = JSON.parse(raw);

    if (typeof parsed.serverName === "string") {
        serverName = parsed.serverName;
    }

    if (typeof parsed.maxPlayers === "number") {
        maxPlayers = parsed.maxPlayers;
    }

    if (Array.isArray(parsed.worlds)) {
        worlds = parsed.worlds;
    }
} catch (err) {
    logger.info("[config] failed to load config.json", err);
}

export const config: ServerConfig = {
    // Bind all interfaces by default so LAN/mobile clients can reach the WS server.
    host: process.env.HOST || "0.0.0.0",
    port: portEnv ? parseInt(portEnv, 10) || 43594 : 43594,
    tickMs: tickMsEnv ? parseInt(tickMsEnv, 10) || 600 : 600,
    serverName: process.env.SERVER_NAME?.trim() || serverName,
    maxPlayers,
    worlds,
};
