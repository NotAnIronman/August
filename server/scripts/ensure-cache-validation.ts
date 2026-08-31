import fs from "node:fs";
import path from "node:path";

type CacheMetadata = Readonly<{
    valid_keys?: number;
}>;

type OpenRs2Key = Readonly<{
    group: number;
    key: number[];
}>;

const REQUIRED_CACHE_FILES = [
    "main_file_cache.dat2",
    "main_file_cache.idx255",
    "main_file_cache.idx0",
    "info.json",
    "keys.json",
] as const;

function isXteaKey(value: unknown): value is number[] {
    return (
        Array.isArray(value) &&
        value.length === 4 &&
        value.every((part) => Number.isInteger(part))
    );
}

export function parseOpenRs2XteaKeys(
    payload: unknown,
    expectedValidKeys: number,
): Record<string, number[]> {
    if (!Array.isArray(payload)) {
        throw new Error("OpenRS2 keys response must contain an array");
    }

    const xteas: Record<string, number[]> = {};
    for (const candidate of payload) {
        if (!candidate || typeof candidate !== "object") {
            throw new Error("OpenRS2 keys response contains a non-object entry");
        }

        const key = candidate as Partial<OpenRs2Key>;
        if (!Number.isInteger(key.group) || !isXteaKey(key.key)) {
            throw new Error("OpenRS2 keys response contains malformed group/key data");
        }
        xteas[String(key.group)] = key.key;
    }

    if (expectedValidKeys > 0 && Object.keys(xteas).length === 0) {
        throw new Error(
            `OpenRS2 reported ${expectedValidKeys} valid XTEA keys but returned none`,
        );
    }
    return xteas;
}

export function isCacheInstallationValid(cacheDir: string): boolean {
    try {
        for (const fileName of REQUIRED_CACHE_FILES) {
            const filePath = path.join(cacheDir, fileName);
            const stat = fs.statSync(filePath);
            if (!stat.isFile() || stat.size === 0) return false;
        }

        const metadata: unknown = JSON.parse(
            fs.readFileSync(path.join(cacheDir, "info.json"), "utf8"),
        );
        const storedKeys: unknown = JSON.parse(
            fs.readFileSync(path.join(cacheDir, "keys.json"), "utf8"),
        );
        if (!metadata || typeof metadata !== "object") return false;
        if (!storedKeys || typeof storedKeys !== "object" || Array.isArray(storedKeys)) {
            return false;
        }

        const expectedValidKeys = Number((metadata as CacheMetadata).valid_keys ?? 0);
        const keyEntries = Object.values(storedKeys as Record<string, unknown>);
        if (expectedValidKeys > 0 && keyEntries.length === 0) return false;
        return keyEntries.every(isXteaKey);
    } catch {
        return false;
    }
}
