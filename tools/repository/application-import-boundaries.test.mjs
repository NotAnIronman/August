import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    applicationImportSpecifiers,
    applicationImportViolation,
    isExplicitTestSource,
} from "./check-repository-structure.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const applications = ["client", "docs", "server"].map((name) => ({
    name,
    alias: `@${name}`,
    packageName: `@august/${name}`,
    root: path.join(repositoryRoot, "apps", name),
    sourceRoot: path.join(repositoryRoot, "apps", name, "src"),
}));
const client = applications.find((application) => application.name === "client");
const clientFile = path.join(client.sourceRoot, "features", "fixture.tsx");

const source = `
import type { ClientOnly } from "@client/core/client-only";
export { shared } from "@august/protocol/shared";
const lazy = import("@server/private");
const cjs = require("@tools/cache/private");
const resolved = require.resolve("apps/server/src/private");
const metaResolved = import.meta.resolve("@august/server");
const moduleRequired = module.require("server/src/private");
const example = 'import("@server/not-code")';
// import "@server/not-code-either";
/* require("@tools/not-code-either") */
const view = <div>{'import("@server/not-jsx-code")'}</div>;
`;

const parsed = applicationImportSpecifiers(clientFile, source).map(({ specifier }) => specifier);
assert.deepEqual(parsed, [
    "@client/core/client-only",
    "@august/protocol/shared",
    "@server/private",
    "@tools/cache/private",
    "apps/server/src/private",
    "@august/server",
    "server/src/private",
]);

function violation(specifier, filePath = clientFile) {
    return applicationImportViolation({
        filePath,
        specifier,
        currentApplication: client,
        applications,
    });
}

assert.equal(violation("@client/core/client-only"), undefined);
assert.equal(violation("@august/protocol/shared"), undefined);
assert.equal(violation("@server/private")?.code, "cross-app-private-alias");
assert.equal(violation("@server/private?worker")?.code, "cross-app-private-alias");
assert.equal(violation("@august/server")?.code, "cross-app-package-import");
assert.equal(violation("apps/server/src/private")?.code, "cross-app-source-import");
assert.equal(violation("server/src/private")?.code, "cross-app-source-import");
assert.equal(violation("@tools/cache/private")?.code, "runtime-tool-import");
assert.equal(violation("@august/tools/cache")?.code, "runtime-tool-import");
assert.equal(violation("tools/cache/private")?.code, "runtime-tool-import");
assert.equal(violation("@serverless/runtime"), undefined);
assert.equal(violation("@toolshed/runtime"), undefined);
assert.equal(violation("../../../server/src/private")?.code, "cross-app-relative-import");
assert.equal(violation("../../../../tools/cache/private")?.code, "runtime-tool-import");

assert.equal(
    isExplicitTestSource(
        path.join(client.sourceRoot, "features", "fixture.test.ts"),
        client.sourceRoot,
    ),
    true,
);
assert.equal(
    isExplicitTestSource(
        path.join(client.sourceRoot, "features", "__tests__", "fixture.ts"),
        client.sourceRoot,
    ),
    true,
);
assert.equal(
    isExplicitTestSource(path.join(client.sourceRoot, "features", "fixture.ts"), client.sourceRoot),
    false,
);

console.log("application import boundary tests passed");
