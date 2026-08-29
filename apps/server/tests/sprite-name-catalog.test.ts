import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    defaultSpriteNameCatalogPath,
    readSpriteNameCatalog,
    resolveSpriteRefByName,
    setSpriteName,
} from "@server/world/SpriteNameCatalogFile";
import { CLIENT_CATALOG_ROOT, CLIENT_ROOT } from "@server/paths";

const canonicalPath = path.join(CLIENT_CATALOG_ROOT, "sprite-names.json");
assert.equal(defaultSpriteNameCatalogPath(), canonicalPath);
assert.equal(fs.existsSync(canonicalPath), true, "canonical sprite catalog must exist");
assert.equal(
    defaultSpriteNameCatalogPath().startsWith(path.join(CLIENT_ROOT, "public")),
    false,
    "the server must never write into the client public directory",
);

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "august-sprite-catalog-test-"));
const testCatalogPath = path.join(testDirectory, "nested", "sprite-names.json");

try {
    assert.deepEqual(readSpriteNameCatalog(testCatalogPath), {});

    fs.mkdirSync(path.dirname(testCatalogPath), { recursive: true });
    fs.writeFileSync(
        testCatalogPath,
        JSON.stringify({
            "10:2": "ui.beta",
            "2:10": "ui.alpha-ten",
            "2:3": "Minimap.Compass-dial",
            "-1:0": "invalid.negative-archive",
            "1:-1": "invalid.negative-frame",
            "3:0": "invalid name with spaces",
            "4:0": "",
            "5:0": "x".repeat(81),
            "6:0": 42,
        }),
        "utf8",
    );

    assert.deepEqual(readSpriteNameCatalog(testCatalogPath), {
        "2:3": "Minimap.Compass-dial",
        "2:10": "ui.alpha-ten",
        "10:2": "ui.beta",
    });

    assert.deepEqual(setSpriteName(3, 1, "ui.gamma", testCatalogPath), {
        ok: true,
        ref: "3:1",
        name: "ui.gamma",
        previousName: undefined,
    });

    const expectedPersistedCatalog = {
        "2:3": "Minimap.Compass-dial",
        "2:10": "ui.alpha-ten",
        "3:1": "ui.gamma",
        "10:2": "ui.beta",
    };
    assert.deepEqual(readSpriteNameCatalog(testCatalogPath), expectedPersistedCatalog);
    assert.equal(
        fs.readFileSync(testCatalogPath, "utf8"),
        `${JSON.stringify(expectedPersistedCatalog, null, 4)}\n`,
        "persistence must be normalized, numerically ordered, and newline terminated",
    );
    assert.deepEqual(resolveSpriteRefByName("ui.gamma", testCatalogPath), {
        archiveId: 3,
        frame: 1,
    });

    assert.deepEqual(setSpriteName(3, 1, "ui.gamma-renamed", testCatalogPath), {
        ok: true,
        ref: "3:1",
        name: "ui.gamma-renamed",
        previousName: "ui.gamma",
    });

    const beforeRejectedWrites = fs.readFileSync(testCatalogPath, "utf8");
    assert.deepEqual(setSpriteName(-1, 0, "ui.invalid", testCatalogPath), {
        ok: false,
        reason: "invalid-ref",
    });
    assert.deepEqual(setSpriteName(1, 0, "invalid name", testCatalogPath), {
        ok: false,
        reason: "invalid-name",
    });
    assert.equal(fs.readFileSync(testCatalogPath, "utf8"), beforeRejectedWrites);

    fs.writeFileSync(testCatalogPath, "not-json", "utf8");
    assert.deepEqual(readSpriteNameCatalog(testCatalogPath), {});
} finally {
    fs.rmSync(testDirectory, { recursive: true, force: true });
}

console.log("Sprite name catalog contract test passed");
