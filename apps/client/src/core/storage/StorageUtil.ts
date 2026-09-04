export type StorageBudget = {
    usage: number;
    quota: number;
    available: number;
};

function getNavigatorStorage(): StorageManager | undefined {
    if (typeof navigator === "undefined") return undefined;
    try {
        return navigator.storage;
    } catch {
        return undefined;
    }
}

export async function getStorageBudget(): Promise<StorageBudget | undefined> {
    const storage = getNavigatorStorage();
    if (!storage || typeof storage.estimate !== "function") {
        return undefined;
    }
    try {
        const estimate = await storage.estimate();
        const usage = estimate.usage ?? 0;
        const quota = estimate.quota ?? 0;
        return {
            usage,
            quota,
            available: Math.max(0, quota - usage),
        };
    } catch {
        return undefined;
    }
}

export async function ensurePersistentStorage(): Promise<boolean | "unsupported"> {
    const storage = getNavigatorStorage();
    if (!storage || typeof storage.persist !== "function") {
        return "unsupported";
    }
    try {
        if (typeof storage.persisted === "function") {
            const alreadyPersisted = await storage.persisted();
            if (alreadyPersisted) {
                return true;
            }
        }
    } catch {}
    try {
        return await storage.persist();
    } catch {
        return false;
    }
}

export function describePersistentStorageUnavailable(secureContext: boolean): string {
    if (!secureContext) {
        return "This HTTP connection cannot protect cached assets from browser cleanup or save encrypted passwords. HTTPS is required. This does not affect server-side character saves.";
    }
    return "Persistent cache storage is unavailable in this browser or browsing mode. Cached assets may be cleared and downloaded again. This does not mean character progress failed to save.";
}

export async function hasEnoughStorage(bytesNeeded: number): Promise<boolean> {
    if (!Number.isFinite(bytesNeeded) || bytesNeeded <= 0) {
        return true;
    }
    const budget = await getStorageBudget();
    if (!budget) {
        // Unable to determine quota: assume success and let the download proceed.
        return true;
    }
    return budget.available >= bytesNeeded;
}

export function describeStorageShortfall(bytesNeeded: number, budget?: StorageBudget): string {
    if (!budget) {
        return `Requires roughly ${Math.ceil(bytesNeeded / (1024 * 1024))} MB of storage.`;
    }
    const lacking = Math.max(0, bytesNeeded - budget.available);
    const format = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `Needs ${format(bytesNeeded)} free storage; only ${format(
        budget.available,
    )} is available (usage ${format(budget.usage)} of ${format(
        budget.quota,
    )} quota). Additional ${format(lacking)} required.`;
}
