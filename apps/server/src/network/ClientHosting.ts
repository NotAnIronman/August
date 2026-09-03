import { existsSync, statSync } from "node:fs";
import { createReadStream } from "node:fs";
import { resolve, sep } from "node:path";

import type { IncomingMessage, ServerResponse } from "node:http";

export interface ClientHostingOptions {
    readonly worldId: number;
    readonly serverName: string;
    readonly gamePort: number;
    readonly maxPlayers: number;
}

const CLIENT_BUILD_DIR = resolve(
    process.env.CLIENT_BUILD_DIR?.trim() || resolve(__dirname, "../../../client/build"),
);
const SERVER_CACHE_DIR = resolve(__dirname, "../../var/cache/osrs");

const CONTENT_TYPES: Readonly<Record<string, string>> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

function requestPath(url: string | undefined): string {
    try {
        return decodeURIComponent(new URL(url ?? "/", "http://localhost").pathname);
    } catch {
        return "/";
    }
}

function isWithinDirectory(filePath: string, directory: string): boolean {
    return filePath === directory || filePath.startsWith(`${directory}${sep}`);
}

function isWithinBuildDirectory(filePath: string): boolean {
    return isWithinDirectory(filePath, CLIENT_BUILD_DIR);
}

function getSharedHost(req: IncomingMessage): string | undefined {
    const configured = process.env.PUBLIC_HOST?.trim();
    if (configured) return configured;
    const host = req.headers.host?.trim();
    if (!host) return undefined;
    if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
    return host.replace(/:\d+$/, "");
}

function serveMissingBuild(res: ServerResponse): void {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("The August client has not been built yet. Run: pnpm --filter @august/client build");
}

function serveNotFound(res: ServerResponse): void {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
}

function streamFile(req: IncomingMessage, res: ServerResponse, filePath: string, cacheControl: string): void {
    const stat = statSync(filePath);
    const extensionIndex = filePath.lastIndexOf(".");
    const extension = extensionIndex >= 0 ? filePath.slice(extensionIndex).toLowerCase() : "";
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    let start = 0;
    let end = stat.size - 1;
    let status = 200;

    if (range && stat.size > 0) {
        const requestedStart = range[1] ? Number(range[1]) : undefined;
        const requestedEnd = range[2] ? Number(range[2]) : undefined;
        start = Math.min(requestedStart ?? Math.max(0, stat.size - (requestedEnd ?? 0)), stat.size - 1);
        end = Math.min(requestedEnd ?? stat.size - 1, stat.size - 1);
        if (start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
            res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
            res.end();
            return;
        }
        status = 206;
    }

    const length = Math.max(0, end - start + 1);
    res.writeHead(status, {
        "Accept-Ranges": "bytes",
        "Cache-Control": cacheControl,
        "Content-Length": length,
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        // The browser client uses isolated workers and SharedArrayBuffer where available.
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
        ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${stat.size}` } : {}),
    });
    createReadStream(filePath, { start, end }).on("error", () => res.destroy()).pipe(res);
}

/**
 * Serves the pre-built browser client over the same HTTP server that owns the
 * WebSocket listener. The WebSocket upgrade path remains untouched by this.
 */
export function serveHostedClient(
    req: IncomingMessage,
    res: ServerResponse,
    options: ClientHostingOptions,
): void {
    const path = requestPath(req.url);
    if (path === "/servers.json") {
        const host = getSharedHost(req);
        const address = host ? `${host}:${options.gamePort}` : `localhost:${options.gamePort}`;
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify([{
            id: options.worldId,
            name: options.serverName,
            address,
            secure: false,
            maxPlayers: options.maxPlayers,
            location: 0,
            activity: options.serverName,
            properties: 0,
        }]));
        return;
    }

    if (path.startsWith("/caches/")) {
        const cachePath = resolve(SERVER_CACHE_DIR, path.slice("/caches/".length));
        if (!isWithinDirectory(cachePath, SERVER_CACHE_DIR) || !existsSync(cachePath) || statSync(cachePath).isDirectory()) {
            serveNotFound(res);
            return;
        }
        streamFile(req, res, cachePath, "public, max-age=3600");
        return;
    }

    if (!existsSync(CLIENT_BUILD_DIR)) {
        serveMissingBuild(res);
        return;
    }

    const relativePath = path === "/" ? "index.html" : path.slice(1);
    let filePath = resolve(CLIENT_BUILD_DIR, relativePath);
    if (!isWithinBuildDirectory(filePath) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
        // Browser routes are client-owned, so serve the app shell as the SPA fallback.
        filePath = resolve(CLIENT_BUILD_DIR, "index.html");
    }
    if (!existsSync(filePath)) {
        serveMissingBuild(res);
        return;
    }

    const isHashedAsset = /\.[a-f0-9]{8,}\./i.test(filePath);
    streamFile(req, res, filePath, isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache");
}
