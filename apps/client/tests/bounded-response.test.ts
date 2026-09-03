import assert from "node:assert/strict";

import {
    readBoundedJsonResponse,
    readBoundedResponseBytes,
} from "@client/core/network/BoundedResponse";

async function main(): Promise<void> {
    assert.deepEqual(
        await readBoundedJsonResponse(
            new Response('{"ok":true}', { headers: { "Content-Length": "11" } }),
            32,
        ),
        { ok: true },
    );

    await assert.rejects(
        readBoundedResponseBytes(
            new Response(new Uint8Array([1]), {
                headers: { "Content-Length": "1000" },
            }),
            16,
        ),
        /exceeds the 16-byte response limit/,
    );

    const oversizedChunked = new Response(
        new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(10));
                controller.enqueue(new Uint8Array(10));
                controller.close();
            },
        }),
    );
    await assert.rejects(
        readBoundedResponseBytes(oversizedChunked, 16),
        /exceeds the 16-byte response limit/,
    );

    await assert.rejects(
        readBoundedJsonResponse(new Response("not json"), 32),
        SyntaxError,
    );

    console.log("bounded response regression tests passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
