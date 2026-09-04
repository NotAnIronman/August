import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { logger } from "@server/observability/logger";

import {
    parseServerConfigJson,
    resolveServerConfig,
} from "@server/config/ServerConfigResolver";

export type { ServerConfig, WorldConfig } from "@server/config/ServerConfigResolver";

const configPath = resolve(__dirname, "../../config.json");

function readFileConfig(): unknown {
    try {
        return parseServerConfigJson(readFileSync(configPath, "utf-8"), configPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            logger.info(`[config] ${configPath} was not found; using built-in defaults.`);
            return undefined;
        }
        throw error;
    }
}

const resolved = resolveServerConfig({
    fileConfig: readFileConfig(),
    environment: process.env,
    argv: process.argv,
});

export const activeWorld = resolved.activeWorld;
export const config = resolved.config;
