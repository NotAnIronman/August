import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    auditDocumentationLinks,
    extractDocumentationTargets,
} from "./check-documentation-links.mjs";

assert.deepEqual(
    extractDocumentationTargets(
        [
            '[Inline](guide/setup.md) ![Image](images/map.png)',
            '[Reference]: ../README.md "Root"',
            '`[Inline code](ignored.md)`',
            '```md\n[Fenced code](ignored.md)\n```',
        ].join("\n"),
    ),
    ["guide/setup.md", "images/map.png", "../README.md"],
);

const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "august-documentation-links-"));
try {
    mkdirSync(path.join(fixtureRoot, "apps", "docs", "guide"), { recursive: true });
    writeFileSync(path.join(fixtureRoot, "README.md"), "# Fixture\n");
    writeFileSync(path.join(fixtureRoot, "apps", "docs", "guide", "setup.md"), "# Setup\n");
    writeFileSync(
        path.join(fixtureRoot, "apps", "docs", "index.md"),
        [
            "[Valid](guide/setup.md)",
            "[Extensionless](/guide/setup)",
            "[Wrong case](guide/Setup.md)",
            "[Missing](guide/missing.md)",
            "[External](https://example.com/ignored)",
        ].join("\n"),
    );

    const result = auditDocumentationLinks(fixtureRoot);
    assert.equal(result.checkedFiles, 3);
    assert.equal(result.checkedLinks, 4);
    assert.deepEqual(result.issues, [
        "apps/docs/index.md [path-case] guide/Setup.md should resolve to apps/docs/guide/setup.md",
        "apps/docs/index.md [missing-target] guide/missing.md",
    ]);
} finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("documentation link tests passed");
