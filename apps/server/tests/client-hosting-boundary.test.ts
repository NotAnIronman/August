import assert from "node:assert/strict";

import type { IncomingMessage, ServerResponse } from "node:http";
import { serveHostedClient } from "@server/network/ClientHosting";

async function request(method: string, url: string) {
    let status = 0;
    let headers: Record<string, unknown> = {};
    let body = "";
    const response = {
        writeHead(code: number, values?: Record<string, unknown>) {
            status = code;
            headers = values ?? {};
            return this;
        },
        end(value?: unknown) {
            body = value === undefined ? "" : String(value);
            return this;
        },
    } as unknown as ServerResponse;
    const incoming = {
        method,
        url,
        headers: {},
    } as IncomingMessage;

    await serveHostedClient(incoming, response, {
        worldId: 1,
        serverName: "Test",
        gamePort: 43_594,
        maxPlayers: 2_047,
    });
    return { status, headers, body };
}

async function main(): Promise<void> {
    const unsupportedMethod = await request("POST", "/");
    assert.equal(unsupportedMethod.status, 405);
    assert.equal(unsupportedMethod.headers.Allow, "GET, HEAD");

    const malformedPath = await request("GET", "/%not-valid");
    assert.equal(malformedPath.status, 400);
    assert.match(malformedPath.body, /Bad request/);

    const serverList = await request("GET", "/servers.json");
    assert.equal(serverList.status, 200);
    assert.equal(serverList.headers["X-Content-Type-Options"], "nosniff");
    const endpoint = JSON.parse(serverList.body)[0] as Record<string, unknown>;
    assert.equal(endpoint.id, 1);
    assert.equal(endpoint.name, "Test");
    assert.equal(endpoint.maxPlayers, 2_047);
    assert.equal(typeof endpoint.address, "string");

    console.log("client hosting boundary regression tests passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
