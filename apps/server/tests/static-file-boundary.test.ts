import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveStaticFile } from "@server/network/StaticFileBoundary";

async function main(): Promise<void> {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "august-static-root-"));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "august-static-outside-"));
    try {
        const insidePath = path.join(temporaryRoot, "inside.txt");
        const outsidePath = path.join(outsideRoot, "outside.txt");
        fs.writeFileSync(insidePath, "inside");
        fs.writeFileSync(outsidePath, "outside");

        const resolvedInside = await resolveStaticFile(temporaryRoot, "inside.txt");
        assert.ok(resolvedInside);
        assert.equal(fs.readFileSync(resolvedInside.filePath, "utf8"), "inside");
        assert.equal(
            await resolveStaticFile(temporaryRoot, path.relative(temporaryRoot, outsidePath)),
            undefined,
        );
        assert.equal(await resolveStaticFile(temporaryRoot, "missing.txt"), undefined);

        const linkedDirectory = path.join(temporaryRoot, "linked");
        try {
            fs.symlinkSync(outsideRoot, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
            assert.equal(
                await resolveStaticFile(temporaryRoot, path.join("linked", "outside.txt")),
                undefined,
            );
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EPERM" && code !== "EACCES" && code !== "ENOTSUP") throw error;
        }
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
        fs.rmSync(outsideRoot, { recursive: true, force: true });
    }

    console.log("static file boundary regression tests passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
