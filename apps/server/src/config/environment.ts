export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function readEnvText(
    name: string,
    environment: EnvironmentSource = process.env,
): string | undefined {
    const raw = environment[name];
    if (raw === undefined) {
        return undefined;
    }

    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_ENV_VALUES = new Set(["0", "false", "no", "off"]);

/**
 * Reads a conventional boolean environment variable without treating every
 * non-empty string as truthy. Unknown values deliberately fall back to the
 * supplied default so a typo cannot silently enable diagnostics or features.
 */
export function readBooleanEnv(
    name: string,
    defaultValue: boolean = false,
    environment: EnvironmentSource = process.env,
): boolean {
    const raw = readEnvText(name, environment)?.toLowerCase();
    if (raw === undefined) return defaultValue;
    if (TRUE_ENV_VALUES.has(raw)) return true;
    if (FALSE_ENV_VALUES.has(raw)) return false;
    return defaultValue;
}

const INTEGER_ENV_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;

function parseEnvInteger(name: string, environment: EnvironmentSource): number | undefined {
    const raw = readEnvText(name, environment);
    if (raw === undefined) {
        return undefined;
    }

    if (!INTEGER_ENV_PATTERN.test(raw)) {
        return undefined;
    }

    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) {
        return undefined;
    }

    return Math.trunc(parsed);
}

export function readPositiveEnvInteger(
    name: string,
    environment: EnvironmentSource = process.env,
): number | undefined {
    const parsed = parseEnvInteger(name, environment);
    return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

export function readNonNegativeEnvInteger(
    name: string,
    environment: EnvironmentSource = process.env,
): number | undefined {
    const parsed = parseEnvInteger(name, environment);
    return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}
