import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IncomingMessage, ServerResponse } from "node:http";
const fixtureDirectory = mkdtempSync(join(tmpdir(), "august-hosting-"));
const previousBuildDirectory = process.env.CLIENT_BUILD_DIR;
process.env.CLIENT_BUILD_DIR = fixtureDirectory;
const { serveHostedClient } = require("@server/network/ClientHosting") as typeof import("@server/network/ClientHosting");

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
    writeFileSync(join(fixtureDirectory, "codec.wasm"), new Uint8Array([0, 97, 115, 109]));
    const wasm = await request("HEAD", "/codec.wasm?url");
    assert.equal(wasm.status, 200);
    assert.equal(wasm.headers["Content-Type"], "application/wasm");
    assert.equal(wasm.headers["Content-Length"], 4);
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
}).finally(() => {
    rmSync(fixtureDirectory, { recursive: true, force: true });
    if (previousBuildDirectory === undefined) delete process.env.CLIENT_BUILD_DIR;
    else process.env.CLIENT_BUILD_DIR = previousBuildDirectory;
});
