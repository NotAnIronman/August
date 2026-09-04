import { isIP } from "node:net";

import type { IncomingHttpHeaders } from "node:http";
import { readBooleanEnv, type EnvironmentSource } from "@server/config/environment";

function isLoopback(address: string | undefined): boolean {
    const normalized = address?.trim().toLowerCase();
    return normalized === "127.0.0.1" || normalized === "::1" || normalized === "::ffff:127.0.0.1";
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
    const text = Array.isArray(value) ? value[0] : value;
    return text?.split(",", 1)[0]?.trim();
}

function normalizeAddress(value: string | undefined): string | undefined {
    if (!value) return undefined;
    let candidate = value.trim().replace(/^"|"$/g, "");
    if (candidate.startsWith("[")) {
        const closingBracket = candidate.indexOf("]");
        if (closingBracket > 0) candidate = candidate.slice(1, closingBracket);
    } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
        candidate = candidate.slice(0, candidate.lastIndexOf(":"));
    }
    return isIP(candidate) ? candidate : undefined;
}

function forwardedAddress(headers: IncomingHttpHeaders): string | undefined {
    const xForwarded = normalizeAddress(firstHeaderValue(headers["x-forwarded-for"]));
    if (xForwarded) return xForwarded;
    const xRealIp = normalizeAddress(firstHeaderValue(headers["x-real-ip"]));
    if (xRealIp) return xRealIp;

    const forwarded = firstHeaderValue(headers.forwarded);
    const match = forwarded?.match(/(?:^|;)\s*for=("?\[[^\]]+\](?::\d+)?"?|"?[^;,\s]+"?)/i);
    return normalizeAddress(match?.[1]);
}

/**
 * Resolve a rate-limit identity without trusting spoofable forwarding headers.
 * Headers are honored only when TRUST_PROXY is explicit and the direct peer is
 * loopback, which matches the supported same-host TLS reverse-proxy setup.
 */
export function resolveClientAddress(
    peerAddress: string | undefined,
    headers: IncomingHttpHeaders,
    environment: EnvironmentSource = process.env,
): string | undefined {
    if (!readBooleanEnv("TRUST_PROXY", false, environment) || !isLoopback(peerAddress)) {
        return peerAddress;
    }
    return forwardedAddress(headers) ?? peerAddress;
}
