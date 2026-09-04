import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    auditClientBuildArtifacts,
    DEFAULT_MAIN_GZIP_LIMIT_BYTES,
    parseMainGzipLimit,
} from "./check-client-build-artifacts.mjs";

assert.equal(parseMainGzipLimit(undefined), DEFAULT_MAIN_GZIP_LIMIT_BYTES);
assert.equal(parseMainGzipLimit("2048"), 2048);
assert.throws(() => parseMainGzipLimit("0"), /positive integer/);
assert.throws(() => parseMainGzipLimit("1.5"), /positive integer/);

const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "august-client-artifacts-"));
try {
    const javascriptRoot = path.join(fixtureRoot, "static", "js");
    mkdirSync(javascriptRoot, { recursive: true });
    const mainPath = path.join(javascriptRoot, "main.abc123.js");
    writeFileSync(mainPath, "console.log('fixture');\n");

    const valid = auditClientBuildArtifacts({ buildRoot: fixtureRoot, mainGzipLimitBytes: 1024 });
    assert.deepEqual(valid.issues, []);
    assert.equal(valid.mainFile, mainPath);
    assert.ok(valid.mainBytes > 0);
    assert.ok(valid.mainGzipBytes > 0);

    const tooLarge = auditClientBuildArtifacts({
        buildRoot: fixtureRoot,
        mainGzipLimitBytes: valid.mainGzipBytes - 1,
    });
    assert.match(tooLarge.issues[0], /main bundle is/);

    writeFileSync(`${mainPath}.map`, "{}");
    writeFileSync(mainPath, "console.log('fixture');\n//# sourceMappingURL=main.abc123.js.map\n");
    const mapped = auditClientBuildArtifacts({ buildRoot: fixtureRoot });
    assert.equal(mapped.issues.length, 2);
    assert.match(mapped.issues[0], /source map/);
    assert.match(mapped.issues[1], /source-map reference/);
} finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("client build artifact tests passed");
