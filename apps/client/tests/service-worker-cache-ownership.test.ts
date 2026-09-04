import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const serviceWorkerPath = path.resolve(__dirname, "../public/service-worker.js");
const source = fs.readFileSync(serviceWorkerPath, "utf8");

assert.match(
    source,
    /key\.startsWith\(SHELL_CACHE_PREFIX\)\s*&&\s*key\s*!==\s*CACHE_NAME/,
    "service-worker activation must delete only obsolete shell caches",
);
assert.doesNotMatch(
    source,
    /keys\.filter\(\s*\([^)]*\)\s*=>\s*[^)]*!==\s*CACHE_NAME\s*\)/,
    "service-worker activation must not delete every non-current origin cache",
);

console.log("service-worker cache ownership regression test passed");
