import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

type AssetSource = {
    source(): Buffer | string;
};

type TestCompilation = {
    fileDependencies: Set<string>;
    hooks: {
        processAssets: {
            tap(options: { name: string; stage: number }, callback: () => void): void;
        };
    };
    emitAsset(name: string, source: AssetSource): void;
};

const cracoConfig = require("../craco.config.js") as {
    webpack: { configure(config: any): any };
};

const webpackConfig = cracoConfig.webpack.configure({
    module: { rules: [] },
    optimization: { minimizer: [] },
    plugins: [],
    resolve: { alias: {}, extensions: [], fallback: {}, plugins: [] },
});
const spriteCatalogPlugin = webpackConfig.plugins.find(
    (plugin: { constructor?: { name?: string } }) =>
        plugin?.constructor?.name === "SpriteNamesCatalogPlugin",
);
assert.ok(spriteCatalogPlugin, "CRACO must install the sprite catalog emission plugin");

let onCompilation: ((compilation: TestCompilation) => void) | undefined;
const compiler = {
    hooks: {
        thisCompilation: {
            tap(_name: string, callback: (compilation: TestCompilation) => void): void {
                onCompilation = callback;
            },
        },
    },
    webpack: {
        Compilation: { PROCESS_ASSETS_STAGE_ADDITIONAL: 100 },
        sources: {
            RawSource: class implements AssetSource {
                constructor(private readonly contents: Buffer) {}

                source(): Buffer {
                    return this.contents;
                }
            },
        },
    },
};

spriteCatalogPlugin.apply(compiler);
assert.ok(onCompilation, "plugin must register a compilation hook");

let processAssets: (() => void) | undefined;
let emittedAsset: { name: string; source: AssetSource } | undefined;
const compilation: TestCompilation = {
    fileDependencies: new Set<string>(),
    hooks: {
        processAssets: {
            tap(options, callback): void {
                assert.deepEqual(options, {
                    name: "SpriteNamesCatalogPlugin",
                    stage: 100,
                });
                processAssets = callback;
            },
        },
    },
    emitAsset(name, source): void {
        emittedAsset = { name, source };
    },
};
onCompilation(compilation);

const repositoryRoot = path.resolve(__dirname, "../../..");
const canonicalPath = path.join(
    repositoryRoot,
    "data",
    "catalogs",
    "client",
    "sprite-names.json",
);
assert.deepEqual([...compilation.fileDependencies], [canonicalPath]);
assert.ok(processAssets, "plugin must register an asset-emission hook");
processAssets();
assert.ok(emittedAsset, "plugin must emit the browser-facing catalog asset");
assert.equal(emittedAsset.name, "spriteNames.json");
assert.deepEqual(Buffer.from(emittedAsset.source.source()), fs.readFileSync(canonicalPath));
assert.equal(
    fs.existsSync(path.join(repositoryRoot, "apps", "client", "public", "spriteNames.json")),
    false,
);

console.log("Sprite names catalog Webpack contract test passed");
