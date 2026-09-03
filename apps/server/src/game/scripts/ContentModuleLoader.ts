import fs from "fs";
import path from "path";

import { serverContentPath } from "@server/paths";
import { logger } from "@server/observability/logger";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

export interface ContentModuleEntry {
    id: string;
    register: (registry: IScriptRegistry, services: ScriptServices) => void;
    watch?: string[];
}

export interface ContentModuleLoadIssue {
    readonly moduleName: string;
    readonly reason: "load-failed" | "missing-register";
    readonly error?: unknown;
}

export interface ContentModuleLoadOptions {
    readonly modulesDirectory?: string;
    readonly onIssue?: (issue: ContentModuleLoadIssue) => void;
}

const CONTENT_MODULES_DIR = serverContentPath("modules");
const WATCHED_SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".json", ".mjs", ".ts", ".tsx"]);

/** Lists every reloadable source beneath a module in stable path order. */
export function listContentModuleSourceFiles(moduleDirectory: string): string[] {
    const files: string[] = [];
    const pending = [path.resolve(moduleDirectory)];
    while (pending.length > 0) {
        const directory = pending.pop()!;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(directory, { withFileTypes: true });
        } catch {
            continue;
        }
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const absolute = path.resolve(directory, entry.name);
            if (entry.isDirectory()) {
                pending.push(absolute);
            } else if (entry.isFile() && WATCHED_SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
                files.push(absolute);
            }
        }
    }
    return files.sort((left, right) => left.localeCompare(right));
}

export function loadContentModuleEntries(options: ContentModuleLoadOptions = {}): ContentModuleEntry[] {
    const modulesDirectory = path.resolve(options.modulesDirectory ?? CONTENT_MODULES_DIR);
    if (!fs.existsSync(modulesDirectory)) return [];

    const entries: ContentModuleEntry[] = [];
    let dirs: string[];
    try {
        dirs = fs.readdirSync(modulesDirectory).sort((left, right) => left.localeCompare(right));
    } catch {
        return [];
    }

    for (const name of dirs) {
        const dir = path.resolve(modulesDirectory, name);
        try {
            if (!fs.statSync(dir).isDirectory()) continue;
        } catch {
            continue;
        }
        const indexPath = path.resolve(dir, "index");
        const hasTsIndex = fs.existsSync(path.resolve(dir, "index.ts"));
        const hasJsIndex = fs.existsSync(path.resolve(dir, "index.js"));
        if (!hasTsIndex && !hasJsIndex) continue;

        // Load the module eagerly during discovery so we fail fast
        // on broken content modules rather than deferring errors to registration time.
        let mod: { register?: (registry: IScriptRegistry, services: ScriptServices) => void };
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            mod = require(indexPath);
        } catch (err) {
            logger.warn(`[content-module] failed to load ${name}`, err);
            options.onIssue?.({ moduleName: name, reason: "load-failed", error: err });
            continue;
        }

        if (typeof mod.register !== "function") {
            logger.warn(
                `[content-module] ${name}/index does not export a register() function — skipping`,
            );
            options.onIssue?.({ moduleName: name, reason: "missing-register" });
            continue;
        }

        const registerFn = mod.register;

        entries.push({
            // Keep the existing registration key stable for save/debug compatibility.
            id: `extrascript.${name}`,
            register: (registry, services) => registerFn(registry, services),
            // Imported helpers and JSON definitions are part of the module as
            // surely as index.ts. Invalidating only the entrypoint silently
            // retained stale behavior after splitting a module into files.
            watch: listContentModuleSourceFiles(dir),
        });
    }

    if (entries.length > 0) {
        logger.info(
            `[content-module] discovered ${entries.length}: ${entries.map((e) => e.id).join(", ")}`,
        );
    }

    return entries;
}
