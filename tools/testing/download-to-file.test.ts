import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { downloadToFile } from "../lib/download-to-file";

async function main(): Promise<void> {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "august-download-test-"));

    try {
        const payload = "August streaming download";
        const destinationPath = path.join(temporaryRoot, "nested", "payload.txt");
        const observations: number[] = [];
        const result = await downloadToFile({
            url: `data:text/plain;base64,${Buffer.from(payload).toString("base64")}`,
            destinationPath,
            onProgress: ({ receivedBytes }) => observations.push(receivedBytes),
        });

        assert.equal(fs.readFileSync(destinationPath, "utf8"), payload);
        assert.equal(result.receivedBytes, Buffer.byteLength(payload));
        assert.equal(observations.at(-1), result.receivedBytes);

        const protectedPath = path.join(temporaryRoot, "existing.txt");
        fs.writeFileSync(protectedPath, "preserve me", "utf8");
        await assert.rejects(
            downloadToFile({
                url: "data:text/plain,replacement",
                destinationPath: protectedPath,
            }),
            (error: NodeJS.ErrnoException) => error.code === "EEXIST",
        );
        assert.equal(fs.readFileSync(protectedPath, "utf8"), "preserve me");

        const failedPath = path.join(temporaryRoot, "callback-failure.txt");
        await assert.rejects(
            downloadToFile({
                url: "data:text/plain,partial-output",
                destinationPath: failedPath,
                onProgress: () => {
                    throw new Error("intentional callback failure");
                },
            }),
            /intentional callback failure/,
        );
        assert.equal(fs.existsSync(failedPath), false);

        const oversizedPath = path.join(temporaryRoot, "oversized.txt");
        await assert.rejects(
            downloadToFile({
                url: "data:text/plain,too-large",
                destinationPath: oversizedPath,
                maxBytes: 4,
            }),
            /exceeded the 4-byte limit/,
        );
        assert.equal(fs.existsSync(oversizedPath), false);

        const originalFetch = globalThis.fetch;
        const timeoutPath = path.join(temporaryRoot, "timeout.txt");
        try {
            globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener(
                        "abort",
                        () => reject(init.signal?.reason ?? new Error("aborted")),
                        { once: true },
                    );
                })) as typeof fetch;
            await assert.rejects(
                downloadToFile({
                    url: "https://example.invalid/never",
                    destinationPath: timeoutPath,
                    timeoutMs: 10,
                }),
                /timed out after 10 ms/,
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert.equal(fs.existsSync(timeoutPath), false);

        console.log("streaming download tests passed");
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
