import {
    readBooleanEnv,
    readPositiveEnvInteger,
    type EnvironmentSource,
} from "@server/config/environment";

export interface PublicGameEndpoint {
    readonly address: string;
    readonly secure: boolean;
    readonly explicitlyConfigured: boolean;
}

function boundedPort(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) return fallback;
    const port = Math.trunc(value);
    return port >= 1 && port <= 65_535 ? port : fallback;
}

function stripPort(host: string): string {
    const trimmed = host.trim();
    if (trimmed.startsWith("[")) {
        const closingBracket = trimmed.indexOf("]");
        return closingBracket >= 0 ? trimmed.slice(0, closingBracket + 1) : trimmed;
    }
    return trimmed.replace(/:\d+$/, "");
}

function formatAddress(host: string, port: number): string {
    return `${stripPort(host)}:${port}`;
}

/**
 * Resolve the address advertised to browser clients. PUBLIC_WS_URL is the
 * least ambiguous reverse-proxy setting; PUBLIC_HOST/PUBLIC_PORT/PUBLIC_SECURE
 * remain convenient for direct hosting.
 */
export function resolvePublicGameEndpoint(
    gamePort: number,
    requestHost: string | undefined,
    environment: EnvironmentSource = process.env,
): PublicGameEndpoint {
    const publicWsUrl = environment.PUBLIC_WS_URL?.trim();
    if (publicWsUrl) {
        try {
            const parsed = new URL(publicWsUrl);
            if ((parsed.protocol === "ws:" || parsed.protocol === "wss:") && parsed.hostname) {
                const secure = parsed.protocol === "wss:";
                const defaultPort = secure ? 443 : 80;
                const port = boundedPort(parsed.port ? Number(parsed.port) : undefined, defaultPort);
                const parsedHost = parsed.hostname;
                const host =
                    parsedHost.startsWith("[") || !parsedHost.includes(":")
                        ? parsedHost
                        : `[${parsedHost}]`;
                return { address: formatAddress(host, port), secure, explicitlyConfigured: true };
            }
        } catch {
            // Fall through to the split settings. Startup logging calls out
            // whether the resulting endpoint is securely advertised.
        }
    }

    const configuredHost = environment.PUBLIC_HOST?.trim();
    const secure = readBooleanEnv("PUBLIC_SECURE", false, environment);
    const defaultPort = secure ? 443 : gamePort;
    const publicPort = boundedPort(
        readPositiveEnvInteger("PUBLIC_PORT", environment),
        defaultPort,
    );
    const host = configuredHost || requestHost?.trim() || "localhost";
    return {
        address: formatAddress(host, publicPort),
        secure,
        explicitlyConfigured: Boolean(configuredHost),
    };
}
