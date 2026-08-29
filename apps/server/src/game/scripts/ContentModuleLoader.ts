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

const CONTENT_MODULES_DIR = serverContentPath("modules");

export function loadContentModuleEntries(): ContentModuleEntry[] {
    if (!fs.existsSync(CONTENT_MODULES_DIR)) return [];

    const entries: ContentModuleEntry[] = [];
    let dirs: string[];
    try {
        dirs = fs.readdirSync(CONTENT_MODULES_DIR);
    } catch {
        return [];
    }

    for (const name of dirs) {
        const dir = path.resolve(CONTENT_MODULES_DIR, name);
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
            continue;
        }

        if (typeof mod.register !== "function") {
            logger.warn(
                `[content-module] ${name}/index does not export a register() function — skipping`,
            );
            continue;
        }

        const registerFn = mod.register;

        entries.push({
            // Keep the existing registration key stable for save/debug compatibility.
            id: `extrascript.${name}`,
            register: (registry, services) => registerFn(registry, services),
            watch: hasTsIndex ? [path.resolve(dir, "index.ts")] : [path.resolve(dir, "index.js")],
        });
    }

    if (entries.length > 0) {
        logger.info(
            `[content-module] discovered ${entries.length}: ${entries.map((e) => e.id).join(", ")}`,
        );
    }

    return entries;
}
