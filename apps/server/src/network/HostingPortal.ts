import { networkInterfaces } from "node:os";

import type { PlayerManager } from "@server/game/PlayerManager";
import { resolvePublicGameEndpoint } from "@server/network/PublicGameEndpoint";

export interface HostingPortalOptions {
    readonly serverName: string;
    readonly gamePort: number;
    readonly maxPlayers: number;
    readonly players: () => PlayerManager | undefined;
}

interface HostingPlayer {
    readonly id: number;
    readonly name: string;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, (character) => {
        switch (character) {
            case "&": return "&amp;";
            case "<": return "&lt;";
            case ">": return "&gt;";
            case "'": return "&#39;";
            case '"': return "&quot;";
            default: return character;
        }
    });
}

function getLanAddresses(): string[] {
    const seen = new Set<string>();
    for (const entries of Object.values(networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.internal || entry.family !== "IPv4") continue;
            seen.add(entry.address);
        }
    }
    return [...seen].sort();
}

function getPlayers(players: PlayerManager | undefined): HostingPlayer[] {
    if (!players) return [];
    const result: HostingPlayer[] = [];
    players.forEach((_socket, player) => {
        result.push({ id: player.id, name: player.name || `Player ${player.id}` });
    });
    return result.sort((left, right) => left.name.localeCompare(right.name));
}

/** This page carries operational details, so never serve it to the LAN or internet. */
export function isLocalHostingRequest(
    remoteAddress: string | undefined,
    headers: Readonly<Record<string, string | string[] | undefined>> = {},
): boolean {
    // A public reverse proxy commonly connects from loopback. Never expose the
    // operational dashboard when it reports an upstream client, even if the
    // transport peer itself looks local.
    if (
        headers.forwarded !== undefined ||
        headers["x-forwarded-for"] !== undefined ||
        headers["x-real-ip"] !== undefined
    ) {
        return false;
    }
    if (!remoteAddress) return false;
    const address = remoteAddress.toLowerCase();
    return address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}

export function getHostingSnapshot(options: HostingPortalOptions) {
    const lanAddresses = getLanAddresses();
    const publicEndpoint = resolvePublicGameEndpoint(options.gamePort, undefined);
    const players = getPlayers(options.players());

    return {
        serverName: options.serverName,
        gamePort: options.gamePort,
        maxPlayers: options.maxPlayers,
        listener: "all network interfaces",
        lanAddresses,
        lanEndpoints: lanAddresses.map((address) => `${address}:${options.gamePort}`),
        publicEndpoint: publicEndpoint.explicitlyConfigured ? publicEndpoint.address : undefined,
        publicSecure: publicEndpoint.secure,
        publicHostConfigured: publicEndpoint.explicitlyConfigured,
        players,
        playerCount: players.length,
    };
}

export function renderHostingPortal(options: HostingPortalOptions): string {
    const snapshot = getHostingSnapshot(options);
    const lanEndpoints = snapshot.lanEndpoints.length
        ? snapshot.lanEndpoints.map((endpoint) => `<code>${escapeHtml(endpoint)}</code>`).join("<br>")
        : "No LAN IPv4 address detected.";
    const publicEndpoint = snapshot.publicEndpoint
        ? `<code>${escapeHtml(snapshot.publicEndpoint)}</code> (${snapshot.publicSecure ? "encrypted wss://" : "unencrypted ws://"})`
        : "Not configured — set <code>PUBLIC_HOST</code> to your public IP or DNS name before sharing outside your home network.";
    const transportWarning = snapshot.publicSecure
        ? "The advertised public game connection is encrypted. Make sure your same-host TLS reverse proxy forwards WebSocket upgrades to this listener and set TRUST_PROXY=true so login limits identify each client."
        : "Public logins use plaintext ws://. Anyone able to observe the network path can read credentials. For internet hosting, put the server behind a TLS reverse proxy and set PUBLIC_WS_URL=wss://your-host (or PUBLIC_SECURE=true and PUBLIC_PORT=443).";

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>August server hosting</title><style>
body{max-width:900px;margin:36px auto;padding:0 20px;background:#101318;color:#e9edf3;font:16px system-ui,sans-serif;line-height:1.5}h1{margin-bottom:0}h2{margin:28px 0 8px}.card{background:#1a2029;border:1px solid #303a48;border-radius:10px;padding:18px;margin:14px 0}.good{color:#79da8b}.warn{color:#ffcf70}code{background:#0b0e13;padding:3px 6px;border-radius:4px;word-break:break-all}ol{padding-left:24px}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #303a48}.muted{color:#aeb8c6}</style>
</head><body><h1>August hosting</h1><p class="good">Game listener active on port ${snapshot.gamePort} (${snapshot.listener}).</p>
<div class="card"><h2>Give friends this address</h2><p>${publicEndpoint}</p><p class="muted">Their client’s server address is this value. Do not give them the hosting-page address or any account files.</p></div>
<div class="card"><h2>Connection security</h2><p class="warn">${transportWarning}</p></div>
<div class="card"><h2>Same-network testing</h2><p>${lanEndpoints}</p></div>
<div class="card"><h2>Internet checklist</h2><ol><li>Set <code>PUBLIC_HOST</code> in your server <code>.env</code> to your public IP or a DNS name.</li><li>Forward <strong>TCP ${snapshot.gamePort}</strong> on your router to this computer’s LAN address.</li><li>Allow inbound <strong>TCP ${snapshot.gamePort}</strong> through the computer firewall.</li><li>Have a friend outside your home network connect using the public address above.</li></ol><p class="warn">This page cannot verify a router port-forward from inside your network (many routers do not support loopback tests). An external friend is the reliable test.</p></div>
<div class="card"><h2>Connected players (${snapshot.playerCount}/${snapshot.maxPlayers})</h2><table><thead><tr><th>Character</th><th>Session ID</th></tr></thead><tbody id="players">${snapshot.players.length ? snapshot.players.map((player) => `<tr><td>${escapeHtml(player.name)}</td><td>${player.id}</td></tr>`).join("") : '<tr><td colspan="2" class="muted">Nobody connected.</td></tr>'}</tbody></table></div>
<p class="muted">This dashboard is intentionally available only at <code>http://localhost:${snapshot.gamePort}/hosting</code> on the host computer.</p>
<script>setInterval(async()=>{try{const s=await fetch('/hosting.json',{cache:'no-store'}).then(r=>r.json());document.querySelector('#players').innerHTML=s.players.length?s.players.map(p=>'<tr><td>'+p.name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</td><td>'+p.id+'</td></tr>').join(''):'<tr><td colspan="2" class="muted">Nobody connected.</td></tr>'}catch{}} ,3000);</script>
</body></html>`;
}
