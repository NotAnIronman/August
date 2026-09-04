import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";
import { initOptionalWasm } from "@august/osrs-engine/compression/initOptionalWasm";

async function main(): Promise<void> {
    const dependencyRequire = createRequire(require.resolve("react-scripts/package.json"));
    const webpack = dependencyRequire("webpack");
    const directory = mkdtempSync(path.join(tmpdir(), "august-gzip-"));
    try {
        // Exercise Webpack's real asset-module interop, not a mocked WASM URL.
        await new Promise<void>((resolve, reject) => {
            webpack({
                mode: "production",
                optimization: { minimize: false },
                target: "web",
                entry: path.resolve("../../packages/osrs-engine/src/compression/Gzip.web.ts"),
                output: { path: directory, filename: "gzip.cjs", publicPath: "/assets/", library: { type: "commonjs2" } },
                resolve: { extensions: [".ts", ".js"] },
                module: { rules: [
                    { test: /\.ts$/, use: { loader: dependencyRequire.resolve("babel-loader"), options: {
                        babelrc: false, configFile: false,
                        presets: [dependencyRequire.resolve("@babel/preset-typescript")],
                    } } },
                    { resourceQuery: /url/, type: "asset/resource" },
                ] },
            }, (error: Error | undefined, stats: any) => {
                if (error || stats?.hasErrors()) reject(error ?? new Error(stats.toString()));
                else resolve();
            });
        });
        const code = readFileSync(path.join(directory, "gzip.cjs"), "utf8");
        let fetches = 0;
        function load(fail: boolean) {
            const module = { exports: {} as any };
            runInNewContext(code, {
                module, exports: module.exports, WebAssembly, URL, Request, Response,
                self: { location: { href: "http://test.invalid/assets/gzip.cjs" } },
                Uint8Array, Int8Array, TextDecoder, TextEncoder, setTimeout, clearTimeout,
                console,
                fetch: async (url: unknown) => {
                    fetches++;
                    assert.equal(typeof url, "string", "WASM initializer must receive a URL, not a module namespace");
                    if (fail) throw new Error("WASM unavailable");
                    const assetPath = new URL(url as string, "http://test.invalid").pathname;
                    return new Response(readFileSync(path.join(directory, path.basename(assetPath))), {
                        headers: { "Content-Type": "application/wasm" },
                    });
                },
            });
            return module.exports.Gzip;
        }
        const compressed = gzipSync("Map terrain regression fixture");
        const accelerated = load(false);
        await accelerated.initWasm();
        assert.equal(fetches, 1);
        assert.equal(accelerated.wasmLoaded, true);
        const first = accelerated.decompress(compressed);
        accelerated.decompress(gzipSync("A different second map"));
        assert.equal(Buffer.from(first).toString(), "Map terrain regression fixture", "returned data must survive WASM memory reuse");

        const fallback = load(true);
        await fallback.initWasm();
        assert.equal(fetches, 2);
        assert.equal(fallback.wasmLoaded, false);
        assert.equal(Buffer.from(fallback.decompress(compressed)).toString(), "Map terrain regression fixture");
        assert.throws(() => fallback.decompress(new Uint8Array([1, 2, 3])), "corrupt cache data must still fail");

        await initOptionalWasm("Rejected test accelerator", () => Promise.reject(new Error("blocked")));
        await initOptionalWasm("Synchronous test accelerator", () => { throw new Error("unsupported"); });
        await initOptionalWasm("Stalled test accelerator", () => new Promise(() => {}), 5);
        console.log("browser gzip bundling and optional WASM regression tests passed");
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
