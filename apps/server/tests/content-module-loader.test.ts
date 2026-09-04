import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    listContentModuleSourceFiles,
    loadContentModuleEntries,
    type ContentModuleLoadIssue,
} from "@server/game/scripts/ContentModuleLoader";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "august-content-modules-"));
try {
    const valid = path.join(directory, "valid-module");
    fs.mkdirSync(path.join(valid, "mechanics"), { recursive: true });
    fs.writeFileSync(path.join(valid, "index.js"), "exports.register = () => undefined;\n");
    fs.writeFileSync(path.join(valid, "mechanics", "attack.js"), "exports.id = 1;\n");
    fs.writeFileSync(path.join(valid, "mechanics", "settings.json"), "{}\n");
    fs.writeFileSync(path.join(valid, "notes.md"), "ignored\n");

    const invalid = path.join(directory, "invalid-module");
    fs.mkdirSync(invalid);
    fs.writeFileSync(path.join(invalid, "index.js"), "exports.value = 1;\n");

    const watched = listContentModuleSourceFiles(valid).map((file) =>
        path.relative(valid, file).split(path.sep).join("/"),
    );
    assert.deepEqual(watched, [
        "index.js",
        "mechanics/attack.js",
        "mechanics/settings.json",
    ]);

    const issues: ContentModuleLoadIssue[] = [];
    const entries = loadContentModuleEntries({
        modulesDirectory: directory,
        onIssue: (issue) => issues.push(issue),
    });
    assert.deepEqual(entries.map((entry) => entry.id), ["extrascript.valid-module"]);
    assert.deepEqual(issues.map((issue) => issue.reason), ["missing-register"]);
    assert.deepEqual(
        entries[0]?.watch?.map((file) => path.relative(valid, file).split(path.sep).join("/")),
        watched,
    );
} finally {
    fs.rmSync(directory, { recursive: true, force: true });
}

console.log("content module loader regression test passed");
