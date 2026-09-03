import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    writeJsonFileAtomicallySync,
    writeTextFileAtomicallySync,
} from "@server/io/AtomicFile";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "august-atomic-file-"));
try {
    const textPath = path.join(directory, "nested", "state.txt");
    writeTextFileAtomicallySync(textPath, "first");
    assert.equal(fs.readFileSync(textPath, "utf8"), "first");

    writeTextFileAtomicallySync(textPath, "second");
    assert.equal(fs.readFileSync(textPath, "utf8"), "second");

    const jsonPath = path.join(directory, "catalog.json");
    writeJsonFileAtomicallySync(jsonPath, { version: 1, entries: [1, 2, 3] });
    assert.deepEqual(JSON.parse(fs.readFileSync(jsonPath, "utf8")), {
        version: 1,
        entries: [1, 2, 3],
    });

    const temporaryFiles = fs
        .readdirSync(path.dirname(textPath))
        .filter((name) => name.endsWith(".tmp"));
    assert.deepEqual(temporaryFiles, []);
} finally {
    fs.rmSync(directory, { recursive: true, force: true });
}

console.log("atomic file regression test passed");
