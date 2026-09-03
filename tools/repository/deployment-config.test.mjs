import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(relativePath) {
    return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

const rootConfig = readJson("vercel.json");
const clientRootConfig = readJson("apps/client/vercel.json");

assert.equal(rootConfig.framework, "create-react-app");
assert.equal(clientRootConfig.framework, rootConfig.framework);
assert.deepEqual(clientRootConfig.headers, rootConfig.headers);
assert.deepEqual(clientRootConfig.rewrites, rootConfig.rewrites);
assert.equal(rootConfig.outputDirectory, "apps/client/build");
assert.equal(clientRootConfig.outputDirectory, "build");
assert.match(rootConfig.installCommand, /^pnpm /);
assert.match(rootConfig.buildCommand, /pnpm --filter @august\/client build/);
assert.match(clientRootConfig.installCommand, /^pnpm /);
assert.match(clientRootConfig.buildCommand, /pnpm run build/);

console.log("deployment configuration tests passed");
