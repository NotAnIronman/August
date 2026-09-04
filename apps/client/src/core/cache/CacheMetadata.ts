import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { MAX_CACHE_FILE_BYTES } from "@august/osrs-engine/cache/CacheLimits";

const CACHE_DIRECTORY_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const CACHE_GAME_TYPES = new Set<CacheInfo["game"]>(["classic", "runescape", "oldschool"]);
const MAX_CACHE_CATALOG_ENTRIES = 1_024;
const MAX_CACHE_NAME_LENGTH = 128;
const MAX_CACHE_ENVIRONMENT_LENGTH = 64;
const MAX_XTEA_REGIONS = 65_536;
const MAX_XTEA_REGION_ID = 0xffff;
const MIN_XTEA_WORD = -0x8000_0000;
const MAX_XTEA_WORD = 0xffff_ffff;

/**
 * Validate the server-owned cache catalog before any entry becomes a URL,
 * allocation size, or cache key in the browser.
 */
export function parseCacheInfos(value: unknown): CacheInfo[] {
    if (!Array.isArray(value)) {
        throw new TypeError("Cache metadata must be a JSON array.");
    }
    if (value.length > MAX_CACHE_CATALOG_ENTRIES) {
        throw new TypeError(
            `Cache metadata cannot contain more than ${MAX_CACHE_CATALOG_ENTRIES} entries.`,
        );
    }

    const names = new Set<string>();
    return value.map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new TypeError(`Cache metadata entry ${index} must be an object.`);
        }
        const candidate = entry as Partial<CacheInfo>;
        if (
            typeof candidate.name !== "string" ||
            candidate.name.length > MAX_CACHE_NAME_LENGTH ||
            !CACHE_DIRECTORY_NAME.test(candidate.name) ||
            candidate.name === "." ||
            candidate.name === ".."
        ) {
            throw new TypeError(`Cache metadata entry ${index} has an invalid name.`);
        }
        if (names.has(candidate.name)) {
            throw new TypeError(`Cache metadata contains duplicate name '${candidate.name}'.`);
        }
        names.add(candidate.name);
        if (!CACHE_GAME_TYPES.has(candidate.game as CacheInfo["game"])) {
            throw new TypeError(`Cache metadata entry ${index} has an invalid game type.`);
        }
        if (
            typeof candidate.environment !== "string" ||
            !candidate.environment.trim() ||
            candidate.environment.length > MAX_CACHE_ENVIRONMENT_LENGTH
        ) {
            throw new TypeError(`Cache metadata entry ${index} has an invalid environment.`);
        }
        if (
            typeof candidate.revision !== "number" ||
            !Number.isSafeInteger(candidate.revision) ||
            candidate.revision < 0
        ) {
            throw new TypeError(`Cache metadata entry ${index} has an invalid revision.`);
        }
        if (
            typeof candidate.timestamp !== "string" ||
            !Number.isFinite(Date.parse(candidate.timestamp))
        ) {
            throw new TypeError(`Cache metadata entry ${index} has an invalid timestamp.`);
        }
        if (
            typeof candidate.size !== "number" ||
            !Number.isSafeInteger(candidate.size) ||
            candidate.size < 0 ||
            candidate.size > MAX_CACHE_FILE_BYTES
        ) {
            throw new TypeError(`Cache metadata entry ${index} has an invalid size.`);
        }
        return {
            name: candidate.name,
            game: candidate.game as CacheInfo["game"],
            environment: candidate.environment.trim(),
            revision: candidate.revision,
            timestamp: candidate.timestamp,
            size: candidate.size,
        };
    });
}

/** Validate map-region XTEA keys before cache decoders consume them. */
export function parseXteaMap(value: unknown): Map<number, number[]> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("XTEA metadata must be a JSON object.");
    }

    const entries = Object.entries(value);
    if (entries.length > MAX_XTEA_REGIONS) {
        throw new TypeError(`XTEA metadata cannot contain more than ${MAX_XTEA_REGIONS} regions.`);
    }

    const keys = new Map<number, number[]>();
    for (const [regionText, rawKey] of entries) {
        const region = Number(regionText);
        if (
            !/^\d+$/.test(regionText) ||
            !Number.isSafeInteger(region) ||
            region < 0 ||
            region > MAX_XTEA_REGION_ID
        ) {
            throw new TypeError(`XTEA metadata contains invalid region '${regionText}'.`);
        }
        if (
            !Array.isArray(rawKey) ||
            rawKey.length !== 4 ||
            !rawKey.every(
                (part) =>
                    typeof part === "number" &&
                    Number.isInteger(part) &&
                    part >= MIN_XTEA_WORD &&
                    part <= MAX_XTEA_WORD,
            )
        ) {
            throw new TypeError(`XTEA metadata for region ${regionText} must contain four integers.`);
        }
        keys.set(region, [...rawKey]);
    }
    return keys;
}
