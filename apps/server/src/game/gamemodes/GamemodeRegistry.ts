import fs from "fs";
import path from "path";

import {
    GAMEMODE_ID_REQUIREMENT,
    isValidGamemodeId,
} from "@server/config/GamemodeId";
import { serverContentPath, serverVarPath } from "@server/paths";
import type { GamemodeDefinition } from "@server/game/gamemodes/GamemodeDefinition";

const GAMEMODES_DIR = serverContentPath("gamemodes");
const DATA_DIR = serverVarPath("gamemodes");

function assertGamemodeId(id: string): void {
    if (!isValidGamemodeId(id)) {
        throw new Error(`Invalid gamemode ID "${id}"; expected ${GAMEMODE_ID_REQUIREMENT}.`);
    }
}

function isWithinDirectory(filePath: string, directory: string): boolean {
    const relative = path.relative(directory, filePath);
    return (
        relative === "" ||
        (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    );
}

function resolveGamemodeChild(directory: string, id: string, ...parts: string[]): string {
    assertGamemodeId(id);
    const resolvedDirectory = path.resolve(directory);
    const resolved = path.resolve(resolvedDirectory, id, ...parts);
    if (!isWithinDirectory(resolved, resolvedDirectory)) {
        throw new Error(`Gamemode path for "${id}" escapes its configured root.`);
    }
    return resolved;
}

function assertExistingRealPathContained(filePath: string, directory: string, id: string): void {
    if (!fs.existsSync(filePath) || !fs.existsSync(directory)) return;
    const realDirectory = fs.realpathSync(directory);
    const realFilePath = fs.realpathSync(filePath);
    if (!isWithinDirectory(realFilePath, realDirectory)) {
        throw new Error(
            `Gamemode path for "${id}" resolves outside its configured root (symbolic links are not allowed).`,
        );
    }
}

export function createGamemode(id: string): GamemodeDefinition {
    const gamemodeDir = resolveGamemodeChild(GAMEMODES_DIR, id);
    assertExistingRealPathContained(gamemodeDir, GAMEMODES_DIR, id);
    if (!fs.existsSync(gamemodeDir) || !fs.statSync(gamemodeDir).isDirectory()) {
        const available = listAvailableGamemodes().join(", ");
        throw new Error(`Unknown gamemode "${id}". Available: ${available}`);
    }

    const modulePath = require.resolve(path.resolve(gamemodeDir, "index"));
    assertExistingRealPathContained(modulePath, GAMEMODES_DIR, id);

    // Dynamic require is intentional — gamemodes are discovered at runtime by ID.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod: Record<string, unknown> = require(modulePath);

    if (typeof mod.createGamemode !== "function") {
        throw new Error(
            `Gamemode "${id}" does not export a createGamemode() function from its index`,
        );
    }

    const gamemode = (mod.createGamemode as () => GamemodeDefinition)();

    if (!gamemode.id || !gamemode.name) {
        throw new Error(
            `Gamemode "${id}" createGamemode() returned an object missing required 'id' or 'name' fields`,
        );
    }

    return gamemode;
}

export function getGamemodeDataDir(id: string): string {
    const dataDir = resolveGamemodeChild(DATA_DIR, id);
    assertExistingRealPathContained(dataDir, DATA_DIR, id);
    return dataDir;
}

/** Source-controlled defaults owned by a gamemode, separate from mutable player state. */
export function getGamemodeDefaultsPath(id: string): string {
    const defaultsPath = resolveGamemodeChild(
        GAMEMODES_DIR,
        id,
        "data",
        "player-defaults.json",
    );
    assertExistingRealPathContained(defaultsPath, GAMEMODES_DIR, id);
    return defaultsPath;
}

export function listAvailableGamemodes(): string[] {
    try {
        return fs.readdirSync(GAMEMODES_DIR).filter((entry) => {
            const full = path.resolve(GAMEMODES_DIR, entry);
            return (
                fs.statSync(full).isDirectory() &&
                (fs.existsSync(path.resolve(full, "index.ts")) ||
                    fs.existsSync(path.resolve(full, "index.js")))
            );
        });
    } catch {
        return [];
    }
}
