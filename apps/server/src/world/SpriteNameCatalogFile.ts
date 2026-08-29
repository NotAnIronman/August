import fs from "fs";
import path from "path";

import { clientCatalogPath } from "@server/paths";

/**
 * Server-side read/write for the canonical shared cache-sprite name catalog.
 * The client build emits this catalog as /spriteNames.json, while the browser
 * polls that stable URL through SpriteNameCache.
 *
 * Keeping the source under data/catalogs prevents the server from mutating a
 * second application's public directory. Webpack watches the canonical file,
 * so development updates are re-emitted without restarting either process.
 */
export type SpriteNameCatalog = Readonly<Record<string, string>>;

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REF_PATTERN = /^\d+:\d+$/;

export function defaultSpriteNameCatalogPath(): string {
    return clientCatalogPath("sprite-names.json");
}

function isValidEntry(key: string, value: unknown): value is string {
    return REF_PATTERN.test(key) && typeof value === "string" && NAME_PATTERN.test(value) && value.length <= 80;
}

function normalizeCatalog(value: unknown): SpriteNameCatalog {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const entries: Array<[string, string]> = [];
    for (const [key, name] of Object.entries(value as Record<string, unknown>)) {
        if (isValidEntry(key, name)) entries.push([key, name]);
    }
    entries.sort(([a], [b]) => {
        const [aArchive, aFrame] = a.split(":").map(Number);
        const [bArchive, bFrame] = b.split(":").map(Number);
        return aArchive - bArchive || aFrame - bFrame;
    });
    return Object.fromEntries(entries);
}

export function readSpriteNameCatalog(filePath: string = defaultSpriteNameCatalogPath()): SpriteNameCatalog {
    if (!fs.existsSync(filePath)) return {};
    try {
        return normalizeCatalog(JSON.parse(fs.readFileSync(filePath, "utf8")));
    } catch {
        return {};
    }
}

/**
 * Reverse lookup: common name (e.g. "skill.attack") -> archiveId/frame.
 * Used by server-side scripts (e.g. levelup.ts) that need to push a named
 * sprite to a native widget via the "set_sprite" action, since native
 * interfaces aren't reached by the client-side cacheUiAsset resolver.
 */
export function resolveSpriteRefByName(
    name: string,
    filePath: string = defaultSpriteNameCatalogPath(),
): { archiveId: number; frame: number } | undefined {
    const catalog = readSpriteNameCatalog(filePath);
    for (const [ref, entryName] of Object.entries(catalog)) {
        if (entryName === name) {
            const [archiveId, frame] = ref.split(":").map(Number);
            return { archiveId, frame };
        }
    }
    return undefined;
}

function writeSpriteNameCatalog(filePath: string, catalog: SpriteNameCatalog): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(catalog, null, 4)}\n`, "utf8");
}

export type SetSpriteNameResult =
    | { ok: true; ref: string; name: string; previousName?: string }
    | { ok: false; reason: "invalid-ref" | "invalid-name" };

/**
 * Adds or overwrites a single "archiveId:frame" -> name entry and persists
 * the whole canonical catalog. Used by the ::rename developer command.
 */
export function setSpriteName(
    archiveId: number,
    frame: number,
    name: string,
    filePath: string = defaultSpriteNameCatalogPath(),
): SetSpriteNameResult {
    const ref = `${archiveId | 0}:${Math.max(0, frame | 0)}`;
    if (!REF_PATTERN.test(ref)) return { ok: false, reason: "invalid-ref" };
    if (!NAME_PATTERN.test(name) || name.length > 80) return { ok: false, reason: "invalid-name" };

    const catalog = readSpriteNameCatalog(filePath);
    const previousName = catalog[ref];
    const next = normalizeCatalog({ ...catalog, [ref]: name });
    writeSpriteNameCatalog(filePath, next);
    return { ok: true, ref, name, previousName };
}
