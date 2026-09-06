import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { saveSuccessfulAccount, loadSavedAccountCredentials } from "@client/features/login/SavedAccountSlots";

// Model IDB auto-commit: transactions close once their requests finish, even
// if application code is still awaiting unrelated asynchronous work.
const stores = new Map<string, Map<unknown, any>>();
const database = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => stores.set(name, new Map()),
    transaction(name: string) {
        let active = true;
        let pending = 0;
        const transaction: any = {};
        const finish = () => setImmediate(() => {
            if (active && pending === 0) {
                active = false;
                transaction.oncomplete?.();
            }
        });
        const request = (operation: () => unknown) => {
            if (!active) throw new DOMException("Transaction already committed", "TransactionInactiveError");
            pending++;
            const result: any = {};
            setImmediate(() => {
                result.result = operation();
                pending--;
                result.onsuccess?.();
                finish();
            });
            return result;
        };
        transaction.objectStore = () => ({
            get: (key: unknown) => request(() => stores.get(name)!.get(key)),
            getAll: () => request(() => [...stores.get(name)!.values()]),
            put: (value: any) => request(() => stores.get(name)!.set(value.id ?? value.slot, value)),
        });
        finish();
        return transaction;
    },
};

async function main(): Promise<void> {
    const previousCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    const previousDatabase = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    try {
        Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: {
            open() {
                const request: any = { result: database };
                setImmediate(() => { request.onupgradeneeded?.(); request.onsuccess?.(); });
                return request;
            },
        } });
        Object.defineProperty(globalThis, "crypto", { configurable: true, value: {
            getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
            subtle: {
                async generateKey() {
                    // Force key generation to finish after the old transaction closes.
                    await new Promise((resolve) => setTimeout(resolve, 15));
                    return webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
                },
                encrypt: webcrypto.subtle.encrypt.bind(webcrypto.subtle),
                decrypt: webcrypto.subtle.decrypt.bind(webcrypto.subtle),
            },
        } });
        const slots = await saveSuccessfulAccount("Fixture user", "synthetic-password");
        assert.equal(slots[0].passwordAvailable, true, "asynchronous key generation must survive IDB auto-commit");
        assert.deepEqual(await loadSavedAccountCredentials(0), { username: "Fixture user", password: "synthetic-password" });
        const key = stores.get("keys")!.get("password-key").key;
        assert.equal(key.extractable, false);
        await saveSuccessfulAccount("Second fixture", "second-password");
        assert.equal(stores.get("keys")!.get("password-key").key, key, "existing encryption keys must not be replaced");
        assert.equal((await loadSavedAccountCredentials(0))?.password, "synthetic-password");

        Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
        const httpSlots = await saveSuccessfulAccount("HTTP fixture", "never-store-plaintext");
        assert.equal(httpSlots[2].username, "HTTP fixture");
        assert.equal(httpSlots[2].passwordAvailable, false);
        assert.deepEqual(await loadSavedAccountCredentials(2), { username: "HTTP fixture" });
        const stored = stores.get("slots")!.get(2);
        assert.equal(stored.encryptedPassword, undefined);
        assert.equal(JSON.stringify(stored).includes("never-store-plaintext"), false);
        const previousWindow=Object.getOwnPropertyDescriptor(globalThis,"window");
        try {
            const preferences=new Map<string,string>();
            let prompts=0;
            Object.defineProperty(globalThis,"window",{configurable:true,value:{
                confirm:()=>{prompts++;return true;},localStorage:{getItem:(k:string)=>preferences.get(k)??null,setItem:(k:string,v:string)=>preferences.set(k,v)}}});
            await saveSuccessfulAccount("HTTP fixture","opt-in-fixture-password");
            assert.equal((await loadSavedAccountCredentials(2))?.password,"opt-in-fixture-password");
            await saveSuccessfulAccount("HTTP fixture","changed-fixture-password");
            assert.equal(prompts,1,"consent is remembered on this device");
        } finally {
            if(previousWindow)Object.defineProperty(globalThis,"window",previousWindow);else Reflect.deleteProperty(globalThis,"window");
        }
        console.log("saved-account storage regression tests passed");
    } finally {
        for (const [name, descriptor] of [["crypto", previousCrypto], ["indexedDB", previousDatabase]] as const) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
    }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
