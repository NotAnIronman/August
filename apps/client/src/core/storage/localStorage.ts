/**
 * Safe localStorage primitives. Never throw; return undefined/default on failure.
 */

function getLocalStorage(): Storage | undefined {
    if (typeof window === "undefined") return undefined;
    try {
        return window.localStorage;
    } catch {
        // Access itself can throw in sandboxed frames and privacy-restricted browsers.
        return undefined;
    }
}

export function canUseLocalStorage(): boolean {
    return getLocalStorage() !== undefined;
}

export function readLocalStorageItem(key: string): string | undefined {
    const storage = getLocalStorage();
    if (!storage) return undefined;
    try {
        const value = storage.getItem(key);
        return value === null ? undefined : value;
    } catch {
        return undefined;
    }
}

export function writeLocalStorageItem(key: string, value: string): boolean {
    const storage = getLocalStorage();
    if (!storage) return false;
    try {
        storage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function removeLocalStorageItem(key: string): void {
    const storage = getLocalStorage();
    if (!storage) return;
    try {
        storage.removeItem(key);
    } catch {
        // ignore
    }
}

export function readLocalStorageJson<T>(key: string): T | undefined {
    const raw = readLocalStorageItem(key);
    if (raw === undefined) return undefined;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return undefined;
    }
}

export function writeLocalStorageJson(key: string, value: unknown): boolean {
    try {
        return writeLocalStorageItem(key, JSON.stringify(value));
    } catch {
        return false;
    }
}

export function readLocalStorageBool(key: string, defaultValue: boolean): boolean {
    const raw = readLocalStorageItem(key);
    if (raw === undefined) return defaultValue;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return defaultValue;
}

export function writeLocalStorageBool(key: string, value: boolean): boolean {
    return writeLocalStorageItem(key, String(value));
}

export interface BrowserJsonPersistence<TLoad, TSave = TLoad> {
    load(): TLoad | undefined;
    save(value: TSave): void;
}

/** Shared JSON persistence adapter for browser-backed feature stores. */
export function createBrowserJsonPersistence<TLoad, TSave = TLoad>(
    storageKey: string,
): BrowserJsonPersistence<TLoad, TSave> | undefined {
    if (!canUseLocalStorage()) return undefined;
    return {
        load: () => readLocalStorageJson<TLoad>(storageKey),
        save: (value) => {
            writeLocalStorageJson(storageKey, value);
        },
    };
}
