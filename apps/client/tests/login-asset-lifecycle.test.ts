import assert from "node:assert/strict";

class FakeImage {
    static instances: FakeImage[] = [];

    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = "";

    constructor() {
        FakeImage.instances.push(this);
    }
}

async function main(): Promise<void> {
    const originalImage = (globalThis as any).Image;
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    (globalThis as any).Image = FakeImage;

    try {
        const { loadLogoImage, loadTitleBackground } = await import(
            "@client/features/login/renderer/assets"
        );

        const logoAbortController = new AbortController();
        const logoHost = {
            lifecycleAbortController: logoAbortController,
            logoImage: undefined,
            logoImageLoaded: false,
        } as any;
        const logoPromise = loadLogoImage(logoHost);
        const logo = FakeImage.instances.at(-1)!;
        logoAbortController.abort();
        assert.equal(await logoPromise, false);
        assert.equal(logoHost.logoImage, undefined);
        assert.equal(logoHost.logoImageLoaded, false);
        assert.equal(logo.onload, null);
        assert.equal(logo.onerror, null);

        (globalThis as any).fetch = (_input: unknown, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                const signal = init?.signal;
                const rejectAbort = () => reject(new DOMException("Aborted", "AbortError"));
                if (signal?.aborted) {
                    rejectAbort();
                } else {
                    signal?.addEventListener("abort", rejectAbort, { once: true });
                }
            });
        console.warn = () => {};
        const backgroundAbortController = new AbortController();
        const backgroundHost = {
            lifecycleAbortController: backgroundAbortController,
            titleBackgroundImage: undefined,
        } as any;
        const backgroundPromise = loadTitleBackground(backgroundHost);
        backgroundAbortController.abort();
        assert.equal(await backgroundPromise, false);
        assert.equal(backgroundHost.titleBackgroundImage, undefined);
    } finally {
        (globalThis as any).Image = originalImage;
        (globalThis as any).fetch = originalFetch;
        console.warn = originalWarn;
    }

    console.log("Login asset lifecycle regression test passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
