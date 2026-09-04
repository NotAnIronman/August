import fs from "fs";

import { readBooleanEnv } from "@server/config/environment";
import { serverContentPath } from "@server/paths";
import { logger } from "@server/observability/logger";
import type { GamemodeDefinition } from "@server/game/gamemodes/GamemodeDefinition";
import { loadContentModuleEntries } from "@server/game/scripts/ContentModuleLoader";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";

const CONTENT_MODULES_DIR = serverContentPath("modules");

type ScriptWatchHandle = Pick<fs.FSWatcher, "close">;

export interface ScriptBootstrapOptions {
    modulesDirectory?: string;
    hotReload?: boolean;
    debounceMs?: number;
    watchDirectory?: (
        directory: string,
        options: { persistent: boolean; recursive: boolean },
        listener: () => void,
    ) => ScriptWatchHandle;
    scheduleTimeout?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
    cancelTimeout?: (timeout: NodeJS.Timeout) => void;
}

export interface ScriptBootstrapHandle {
    dispose(): void;
}

function invalidateRequireCache(filePath: string): void {
    try {
        delete require.cache[require.resolve(filePath)];
    } catch (err) {
        logger.warn("[bootstrap] failed to invalidate require cache", err);
    }
}

export function bootstrapScripts(
    runtime: ScriptRuntime,
    gamemode?: GamemodeDefinition,
    options: ScriptBootstrapOptions = {},
): ScriptBootstrapHandle {
    const modulesDirectory = options.modulesDirectory ?? CONTENT_MODULES_DIR;
    const scheduleTimeout =
        options.scheduleTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    const cancelTimeout = options.cancelTimeout ?? clearTimeout;
    const debounceMs = Math.max(0, Math.trunc(options.debounceMs ?? 100));
    let watcher: ScriptWatchHandle | undefined;
    let reloadTimer: NodeJS.Timeout | undefined;
    let disposed = false;
    /** Paths to invalidate before reloading (populated on first load). */
    let watchedPaths: string[] = [];

    const loadAll = () => {
        if (disposed) return;
        const failures: Array<{ id: string; error: unknown }> = [];
        // Invalidate cached modules for hot-reload — no-op on first load
        for (const filePath of watchedPaths) {
            invalidateRequireCache(filePath);
        }

        const contentModuleEntries = loadContentModuleEntries({
            modulesDirectory,
            onIssue: (issue) => {
                failures.push({
                    id: `extrascript.${issue.moduleName}`,
                    error:
                        issue.error ??
                        new Error(`${issue.moduleName}/index does not export register()`),
                });
            },
        });

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
                failures.push({ id: `gamemode.${gamemode.id}`, error: err });
            }
        }

        for (const entry of contentModuleEntries) {
            try {
                runtime.registerHandlers(entry.id, entry.register);
            } catch (err) {
                logger.error(`[script] failed to load content module ${entry.id}`, err);
                failures.push({ id: entry.id, error: err });
            }
        }

        if (failures.length > 0) {
            const summary = failures.map(({ id }) => id).join(", ");
            const strictStartup = readBooleanEnv(
                "SCRIPT_STRICT_STARTUP",
                (process.env.NODE_ENV ?? "development") === "production",
            );
            if (strictStartup) {
                // A strict bootstrap is all-or-nothing. Individual providers
                // already roll back their own registration; reset also removes
                // providers which succeeded before a later provider failed.
                runtime.reset();
                throw new AggregateError(
                    failures.map(({ error }) => error),
                    `Script startup failed for ${failures.length} provider(s): ${summary}`,
                );
            }
            logger.warn(
                `[script] ${failures.length} provider(s) failed and were skipped: ${summary}. ` +
                    "Set SCRIPT_STRICT_STARTUP=1 to fail the world startup instead.",
            );
        }
    };

    loadAll();

    if (options.hotReload ?? readBooleanEnv("SCRIPT_HOT_RELOAD")) {
        const reload = () => {
            if (disposed) return;
            if (reloadTimer) cancelTimeout(reloadTimer);
            reloadTimer = scheduleTimeout(() => {
                reloadTimer = undefined;
                loadAll();
            }, debounceMs);
            reloadTimer.unref?.();
        };

        try {
            if (fs.existsSync(modulesDirectory)) {
                const watchDirectory =
                    options.watchDirectory ??
                    ((directory, watchOptions, listener) =>
                        fs.watch(directory, watchOptions, listener));
                watcher = watchDirectory(
                    modulesDirectory,
                    { persistent: false, recursive: true },
                    reload,
                );
            }
        } catch (err) {
            logger.warn("[script] failed to watch content modules directory", err);
        }
    }

    return {
        dispose: () => {
            if (disposed) return;
            disposed = true;
            if (reloadTimer) {
                cancelTimeout(reloadTimer);
                reloadTimer = undefined;
            }
            watcher?.close();
            watcher = undefined;
            runtime.reset();
        },
    };
}
