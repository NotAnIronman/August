import fs from "fs";

import { serverContentPath } from "@server/paths";
import { logger } from "@server/observability/logger";
import type { GamemodeDefinition } from "@server/game/gamemodes/GamemodeDefinition";
import { loadContentModuleEntries } from "@server/game/scripts/ContentModuleLoader";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";

const CONTENT_MODULES_DIR = serverContentPath("modules");

const debounce = (fn: () => void, delayMs: number): (() => void) => {
    let timeout: NodeJS.Timeout | undefined;
    return () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            timeout = undefined;
            fn();
        }, delayMs);
    };
};

function invalidateRequireCache(filePath: string): void {
    try {
        delete require.cache[require.resolve(filePath)];
    } catch (err) {
        logger.warn("[bootstrap] failed to invalidate require cache", err);
    }
}

export function bootstrapScripts(runtime: ScriptRuntime, gamemode?: GamemodeDefinition): void {
    /** Paths to invalidate before reloading (populated on first load). */
    let watchedPaths: string[] = [];

    const loadAll = () => {
        // Invalidate cached modules for hot-reload — no-op on first load
        for (const filePath of watchedPaths) {
            invalidateRequireCache(filePath);
        }

        const contentModuleEntries = loadContentModuleEntries();

        // Collect watched paths for next reload cycle
        watchedPaths = [];
        for (const entry of contentModuleEntries) {
            if (entry.watch) {
                watchedPaths.push(...entry.watch);
            }
        }

        runtime.reset();

        if (gamemode?.registerHandlers) {
            try {
                runtime.registerHandlers(`gamemode.${gamemode.id}`, (registry, services) =>
                    gamemode.registerHandlers(registry, services),
                );
            } catch (err) {
                logger.error(`[script] failed gamemode registerHandlers for ${gamemode.id}`, err);
            }
        }

        for (const entry of contentModuleEntries) {
            try {
                runtime.registerHandlers(entry.id, entry.register);
            } catch (err) {
                logger.error(`[script] failed to load content module ${entry.id}`, err);
            }
        }
    };

    loadAll();

    if (process.env.SCRIPT_HOT_RELOAD === "1") {
        const reload = debounce(() => {
            loadAll();
        }, 100);

        try {
            if (fs.existsSync(CONTENT_MODULES_DIR)) {
                fs.watch(CONTENT_MODULES_DIR, { persistent: false, recursive: true }, reload);
            }
        } catch (err) {
            logger.info("[script] failed to watch content modules directory", err);
        }
    }
}
