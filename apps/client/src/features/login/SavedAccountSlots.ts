/** Browser-local account chooser storage. Passwords are AES-GCM encrypted. */
export const SAVED_ACCOUNT_SLOT_COUNT = 4;

export type SavedAccountSlot = {
    username: string;
    lastUsed: number;
    passwordAvailable: boolean;
};

export type SavedAccountCredentials = {
    username: string;
    password?: string;
};

type StoredAccountSlot = {
    slot: number;
    username: string;
    lastUsed: number;
    iv?: Uint8Array;
    encryptedPassword?: ArrayBuffer;
};

type StoredKey = { id: "password-key"; key: CryptoKey };

const DATABASE_NAME = "august-saved-accounts-v1";
const KEY_STORE = "keys";
const SLOT_STORE = "slots";
const PASSWORD_KEY_ID = "password-key";
let databasePromise: Promise<IDBDatabase | undefined> | undefined;

function emptySlots(): SavedAccountSlot[] {
    return Array.from({ length: SAVED_ACCOUNT_SLOT_COUNT }, () => ({
        username: "",
        lastUsed: 0,
        passwordAvailable: false,
    }));
}

function storageAvailable(): boolean {
    return typeof indexedDB !== "undefined";
}

function cryptoAvailable(): boolean {
    return typeof crypto !== "undefined" && !!crypto.subtle;
}

function openDatabase(): Promise<IDBDatabase | undefined> {
    if (!storageAvailable()) return Promise.resolve(undefined);
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve) => {
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open(DATABASE_NAME, 1);
        } catch {
            resolve(undefined);
            return;
        }
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(KEY_STORE)) {
                database.createObjectStore(KEY_STORE, { keyPath: "id" });
            }
            if (!database.objectStoreNames.contains(SLOT_STORE)) {
                database.createObjectStore(SLOT_STORE, { keyPath: "slot" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(undefined);
    });
    return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
}

async function readSlots(database: IDBDatabase): Promise<StoredAccountSlot[]> {
    const transaction = database.transaction(SLOT_STORE, "readonly");
    const done = transactionDone(transaction);
    const entries = await requestResult(
        transaction.objectStore(SLOT_STORE).getAll() as IDBRequest<StoredAccountSlot[]>,
    );
    await done;
    return entries;
}

async function passwordKey(database: IDBDatabase): Promise<CryptoKey | undefined> {
    if (!cryptoAvailable()) return undefined;
    try {
        const transaction = database.transaction(KEY_STORE, "readwrite");
        const done = transactionDone(transaction);
        const store = transaction.objectStore(KEY_STORE);
        const stored = await requestResult(
            store.get(PASSWORD_KEY_ID) as IDBRequest<StoredKey | undefined>,
        );
        if (stored?.key) {
            await done;
            return stored.key;
        }
        const key = await crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"],
        );
        store.put({ id: PASSWORD_KEY_ID, key } satisfies StoredKey);
        await done;
        return key;
    } catch {
        return undefined;
    }
}

function toSavedSlots(entries: StoredAccountSlot[]): SavedAccountSlot[] {
    const slots = emptySlots();
    for (const entry of entries) {
        if (
            !Number.isInteger(entry.slot) || entry.slot < 0 ||
            entry.slot >= SAVED_ACCOUNT_SLOT_COUNT || typeof entry.username !== "string"
        ) continue;
        slots[entry.slot] = {
            username: entry.username,
            lastUsed: Number.isFinite(entry.lastUsed) ? entry.lastUsed : 0,
            passwordAvailable: !!entry.iv && !!entry.encryptedPassword,
        };
    }
    return slots;
}

export async function loadSavedAccountSlots(): Promise<SavedAccountSlot[]> {
    const database = await openDatabase();
    if (!database) return emptySlots();
    try {
        return toSavedSlots(await readSlots(database));
    } catch {
        return emptySlots();
    }
}

/** Save an account only after the server accepted its login. */
export async function saveSuccessfulAccount(username: string, password: string): Promise<SavedAccountSlot[]> {
    const displayName = username.trim();
    const database = await openDatabase();
    if (!database || !displayName || !password) return loadSavedAccountSlots();
    try {
        const entries = await readSlots(database);
        const sameName = entries.find((entry) => entry.username.toLowerCase() === displayName.toLowerCase());
        const used = new Set(entries.map((entry) => entry.slot));
        const empty = Array.from({ length: SAVED_ACCOUNT_SLOT_COUNT }, (_, slot) => slot)
            .find((slot) => !used.has(slot));
        const oldest = entries.reduce<StoredAccountSlot | undefined>(
            (oldestEntry, entry) => !oldestEntry || entry.lastUsed < oldestEntry.lastUsed ? entry : oldestEntry,
            undefined,
        );
        const slot = sameName?.slot ?? empty ?? oldest?.slot ?? 0;
        const key = await passwordKey(database);
        let iv: Uint8Array | undefined;
        let encryptedPassword: ArrayBuffer | undefined;
        if (key) {
            const nonce = crypto.getRandomValues(new Uint8Array(12));
            iv = nonce;
            encryptedPassword = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(password),
            );
        }
        const transaction = database.transaction(SLOT_STORE, "readwrite");
        const done = transactionDone(transaction);
        transaction.objectStore(SLOT_STORE).put({
            slot, username: displayName, lastUsed: Date.now(), iv, encryptedPassword,
        } satisfies StoredAccountSlot);
        await done;
        return toSavedSlots(await readSlots(database));
    } catch {
        return loadSavedAccountSlots();
    }
}

/** Password is decrypted only after the player selects an occupied slot. */
export async function loadSavedAccountCredentials(slot: number): Promise<SavedAccountCredentials | undefined> {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SAVED_ACCOUNT_SLOT_COUNT) return undefined;
    const database = await openDatabase();
    if (!database) return undefined;
    try {
        const transaction = database.transaction(SLOT_STORE, "readonly");
        const done = transactionDone(transaction);
        const entry = await requestResult(
            transaction.objectStore(SLOT_STORE).get(slot) as IDBRequest<StoredAccountSlot | undefined>,
        );
        await done;
        if (!entry?.username) return undefined;
        if (!entry.iv || !entry.encryptedPassword) return { username: entry.username };
        const key = await passwordKey(database);
        if (!key) return { username: entry.username };
        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: new Uint8Array(entry.iv) }, key, entry.encryptedPassword,
        );
        return { username: entry.username, password: new TextDecoder().decode(plaintext) };
    } catch {
        return undefined;
    }
}

/** Remove a saved account slot (e.g. the player no longer wants it quick-login listed). */
export async function removeSavedAccount(slot: number): Promise<SavedAccountSlot[]> {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SAVED_ACCOUNT_SLOT_COUNT) {
        return loadSavedAccountSlots();
    }
    const database = await openDatabase();
    if (!database) return emptySlots();
    try {
        const transaction = database.transaction(SLOT_STORE, "readwrite");
        const done = transactionDone(transaction);
        transaction.objectStore(SLOT_STORE).delete(slot);
        await done;
        return toSavedSlots(await readSlots(database));
    } catch {
        return loadSavedAccountSlots();
    }
}
