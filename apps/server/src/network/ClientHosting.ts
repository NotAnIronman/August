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

function isWithinBuildDirectory(filePath: string): boolean {
    return filePath === CLIENT_BUILD_DIR || filePath.startsWith(`${CLIENT_BUILD_DIR}${sep}`);
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

    const extensionIndex = filePath.lastIndexOf(".");
    const extension = extensionIndex >= 0 ? filePath.slice(extensionIndex).toLowerCase() : "";
    const isHashedAsset = /\.[a-f0-9]{8,}\./i.test(filePath);
    res.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
    });
    createReadStream(filePath).on("error", () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
    }).pipe(res);
}
