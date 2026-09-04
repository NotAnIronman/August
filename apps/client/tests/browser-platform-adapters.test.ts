import assert from "node:assert/strict";

import { getPublicAssetUrl } from "@client/core/config/publicAssets";
import { getServerListUrl } from "@client/core/config/clientEnv";
import { fetchWithTimeout } from "@client/core/network/fetchWithTimeout";
import { createCanvasSurface2D } from "@client/core/platform/browser/CanvasSurface";
import { describePersistentStorageUnavailable } from "@client/core/storage/StorageUtil";
import {
    canUseLocalStorage,
    createBrowserJsonPersistence,
    readLocalStorageItem,
    writeLocalStorageItem,
} from "@client/core/storage/localStorage";

async function main(): Promise<void> {
    const httpWarning = describePersistentStorageUnavailable(false);
    assert.match(httpWarning, /HTTPS is required/);
    assert.match(httpWarning, /server-side character saves/);
    assert.doesNotMatch(httpWarning, /modern browser|Install as PWA/);
    assert.match(describePersistentStorageUnavailable(true), /browser or browsing mode/);
    const originalWindow = (globalThis as any).window;
    const originalDocument = (globalThis as any).document;
    const originalFetch = globalThis.fetch;
    const originalPublicUrl = process.env.PUBLIC_URL;

    try {
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: Object.create(null),
        });
        Object.defineProperty((globalThis as any).window, "localStorage", {
            configurable: true,
            get: () => {
                throw new DOMException("blocked", "SecurityError");
            },
        });
        assert.equal(canUseLocalStorage(), false);
        assert.equal(readLocalStorageItem("test"), undefined);
        assert.equal(writeLocalStorageItem("test", "value"), false);

        const values = new Map<string, string>();
        Object.defineProperty((globalThis as any).window, "localStorage", {
            configurable: true,
            value: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
                removeItem: (key: string) => values.delete(key),
            },
        });
        const persistence = createBrowserJsonPersistence<{ enabled: boolean }>("feature");
        assert.ok(persistence);
        persistence.save({ enabled: true });
        assert.deepEqual(persistence.load(), { enabled: true });

        let createdWidth = 0;
        let createdHeight = 0;
        const fakeContext = {};
        (globalThis as any).document = {
            createElement: (tag: string) => {
                assert.equal(tag, "canvas");
                return {
                    set width(value: number) {
                        createdWidth = value;
                    },
                    set height(value: number) {
                        createdHeight = value;
                    },
                    getContext: () => fakeContext,
                };
            },
        };
        const surface = createCanvasSurface2D(320.9, 200.4);
        assert.ok(surface);
        assert.equal(createdWidth, 320);
        assert.equal(createdHeight, 200);
        assert.equal(surface.context, fakeContext);

        (process.env as Record<string, string | undefined>).PUBLIC_URL = "/august/";
        assert.equal(getPublicAssetUrl("/images/logo.png"), "/august/images/logo.png");
        assert.equal(getServerListUrl(), "/august/servers.json");

        let aborted = false;
        globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener(
                    "abort",
                    () => {
                        aborted = true;
                        reject(new DOMException("aborted", "AbortError"));
                    },
                    { once: true },
                );
            })) as typeof fetch;
        await assert.rejects(fetchWithTimeout("https://example.invalid", 1), {
            name: "AbortError",
        });
        assert.equal(aborted, true);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalPublicUrl === undefined) {
            delete (process.env as Record<string, string | undefined>).PUBLIC_URL;
        } else {
            (process.env as Record<string, string | undefined>).PUBLIC_URL = originalPublicUrl;
        }
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: originalWindow,
        });
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: originalDocument,
        });
    }

    console.log("browser platform adapter tests passed");
}

void main();
