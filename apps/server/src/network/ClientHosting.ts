import { createReadStream } from "node:fs";
import { resolve } from "node:path";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Stats } from "node:fs";
import { resolvePublicGameEndpoint } from "@server/network/PublicGameEndpoint";
import { resolveStaticFile } from "@server/network/StaticFileBoundary";

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

function requestPath(url: string | undefined): string | undefined {
    try {
        return decodeURIComponent(new URL(url ?? "/", "http://localhost").pathname);
    } catch {
        return undefined;
    }
}

function getRequestHost(req: IncomingMessage): string | undefined {
    const host = req.headers.host?.trim();
    if (!host) return undefined;
    if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
    return host.replace(/:\d+$/, "");
}

function serveMissingBuild(res: ServerResponse): void {
    res.writeHead(503, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
    });
    res.end("The August client has not been built yet. Run: pnpm --filter @august/client build");
}

function serveNotFound(res: ServerResponse): void {
    res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
    });
    res.end("Not found");
}

function serveBadRequest(res: ServerResponse): void {
    res.writeHead(400, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
    });
    res.end("Bad request");
}

function serveMethodNotAllowed(res: ServerResponse): void {
    res.writeHead(405, {
        Allow: "GET, HEAD",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
    });
    res.end("Method not allowed");
}

function streamFile(
    req: IncomingMessage,
    res: ServerResponse,
    filePath: string,
    fileStat: Stats,
    cacheControl: string,
): void {
    const extensionIndex = filePath.lastIndexOf(".");
    const extension = extensionIndex >= 0 ? filePath.slice(extensionIndex).toLowerCase() : "";
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    let start = 0;
    let end = fileStat.size - 1;
    let status = 200;

    if (range) {
        const hasStart = range[1]?.length > 0;
        const hasEnd = range[2]?.length > 0;
        const requestedStart = hasStart ? Number(range[1]) : undefined;
        const requestedEnd = hasEnd ? Number(range[2]) : undefined;
        if (requestedStart !== undefined) {
            start = requestedStart;
            end = Math.min(requestedEnd ?? fileStat.size - 1, fileStat.size - 1);
        } else {
            const suffixLength = requestedEnd ?? 0;
            start = Math.max(0, fileStat.size - suffixLength);
            end = fileStat.size - 1;
        }
        if (
            fileStat.size === 0 ||
            (!hasStart && (!hasEnd || requestedEnd === 0)) ||
            start < 0 ||
            start >= fileStat.size ||
            start > end ||
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end)
        ) {
            res.writeHead(416, { "Content-Range": `bytes */${fileStat.size}` });
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
        "X-Content-Type-Options": "nosniff",
        // The browser client uses isolated workers and SharedArrayBuffer where available.
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
        ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${fileStat.size}` } : {}),
    });
    if (req.method === "HEAD" || fileStat.size === 0) {
        res.end();
        return;
    }
    createReadStream(filePath, { start, end }).on("error", () => res.destroy()).pipe(res);
}

/**
 * Serves the pre-built browser client over the same HTTP server that owns the
 * WebSocket listener. The WebSocket upgrade path remains untouched by this.
 */
export async function serveHostedClient(
    req: IncomingMessage,
    res: ServerResponse,
    options: ClientHostingOptions,
): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
        serveMethodNotAllowed(res);
        return;
    }
    const path = requestPath(req.url);
    if (path === undefined) {
        serveBadRequest(res);
        return;
    }
    if (path === "/servers.json") {
        const endpoint = resolvePublicGameEndpoint(
            options.gamePort,
            getRequestHost(req),
        );
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        });
        res.end(JSON.stringify([{
            id: options.worldId,
            name: options.serverName,
            address: endpoint.address,
            secure: endpoint.secure,
            maxPlayers: options.maxPlayers,
            location: 0,
            activity: options.serverName,
            properties: 0,
        }]));
        return;
    }

    if (path.startsWith("/caches/")) {
        const hostedFile = await resolveStaticFile(
            SERVER_CACHE_DIR,
            path.slice("/caches/".length),
        );
        if (!hostedFile) {
            serveNotFound(res);
            return;
        }
        streamFile(
            req,
            res,
            hostedFile.filePath,
            hostedFile.fileStat,
            "public, max-age=3600",
        );
        return;
    }

    const relativePath = path === "/" ? "index.html" : path.slice(1);
    let hostedFile = await resolveStaticFile(CLIENT_BUILD_DIR, relativePath);
    if (!hostedFile) {
        // Browser routes are client-owned, so serve the app shell as the SPA fallback.
        hostedFile = await resolveStaticFile(CLIENT_BUILD_DIR, "index.html");
    }
    if (!hostedFile) {
        serveMissingBuild(res);
        return;
    }

    const isHashedAsset = /\.[a-f0-9]{8,}\./i.test(hostedFile.filePath);
    streamFile(
        req,
        res,
        hostedFile.filePath,
        hostedFile.fileStat,
        isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
    );
}
