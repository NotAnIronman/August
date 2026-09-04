import assert from "node:assert/strict";

type Listener = (event: any) => void;

class FakeWebSocket {
    static instances: FakeWebSocket[] = [];

    readonly listeners = new Map<string, Set<Listener>>();
    closeCalls = 0;

    constructor(readonly url: string) {
        FakeWebSocket.instances.push(this);
    }

    addEventListener(type: string, listener: Listener): void {
        let entries = this.listeners.get(type);
        if (!entries) {
            entries = new Set();
            this.listeners.set(type, entries);
        }
        entries.add(listener);
    }

    removeEventListener(type: string, listener: Listener): void {
        this.listeners.get(type)?.delete(listener);
    }

    close(): void {
        this.closeCalls++;
    }
}

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt++) {
        if (predicate()) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    assert.fail("timed out waiting for async probe state");
}

async function main(): Promise<void> {
    const originalFetch = globalThis.fetch;
    const originalWebSocket = (globalThis as any).WebSocket;
    (globalThis as any).fetch = async () => {
        throw new TypeError("HTTP status endpoint unavailable");
    };
    (globalThis as any).WebSocket = FakeWebSocket;

    try {
        const { refreshServerList } = await import(
            "@client/features/login/renderer/serverList"
        );
        const lifecycleAbortController = new AbortController();
        const host = {
            lifecycleAbortController,
            probing: false,
            probed: false,
            serverList: [
                {
                    id: 1,
                    name: "Local",
                    activity: "",
                    address: "127.0.0.1:43594",
                    secure: false,
                    playerCount: null,
                    maxPlayers: 2_047,
                    location: 0,
                    properties: 0,
                },
            ],
        } as any;

        refreshServerList(host);
        await waitFor(() => FakeWebSocket.instances.length === 1);
        const socket = FakeWebSocket.instances[0];
        assert.equal(host.probing, true);

        lifecycleAbortController.abort();
        await waitFor(() => host.probing === false);

        assert.equal(socket.closeCalls, 1, "aborting the login lifecycle must close its probe");
        assert.equal(socket.listeners.get("open")?.size ?? 0, 0);
        assert.equal(socket.listeners.get("error")?.size ?? 0, 0);
        assert.equal(host.probed, false, "an aborted probe run must not be marked complete");
    } finally {
        (globalThis as any).fetch = originalFetch;
        (globalThis as any).WebSocket = originalWebSocket;
    }

    console.log("Login server probe lifecycle regression test passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
